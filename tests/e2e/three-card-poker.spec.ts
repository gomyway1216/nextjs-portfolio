import { test, expect, type Page } from '@playwright/test';

import { handOdds } from '../../src/components/game/ThreeCardPoker/analysis';
import { decide, evaluate, settle, type Bets, type Card, type Decision, type Rank, type Suit } from '../../src/components/game/ThreeCardPoker/engine';

// Hands are random: the tests read the dealt cards off the table, settle them
// with the engine and check the table against it.

async function openGame(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/three-card-poker');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('tcp-callout')).toBeVisible();
}

const bankroll = (page: Page) => page.getByTestId('tcp-bankroll');
const onTable = (page: Page) => page.getByTestId('tcp-on-table');
const message = (page: Page) => page.getByTestId('tcp-message');
const anteSpot = (page: Page) => page.getByRole('button', { name: /^Ante \(1:1\)/ });
const pairPlusSpot = (page: Page) => page.getByRole('button', { name: /^Pair Plus \(/ });
const dealButton = (page: Page) => page.getByRole('button', { name: 'DEAL', exact: true });
const playButton = (page: Page) => page.getByRole('button', { name: 'PLAY', exact: true });
const foldButton = (page: Page) => page.getByRole('button', { name: 'FOLD', exact: true });

/** Clicks the Ante until hydration has attached handlers. */
async function firstAnte(page: Page) {
  await expect(async () => {
    await anteSpot(page).click({ timeout: 1_000 });
    await expect(onTable(page)).not.toHaveText('0', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function cardsOf(page: Page, side: 'player' | 'dealer'): Promise<Card[]> {
  return page
    .locator(`[data-hand="${side}"] [data-rank]`)
    .evaluateAll((els) => els.map((el) => ({ rank: el.getAttribute('data-rank'), suit: el.getAttribute('data-suit') })))
    .then((cards) => cards.map((c) => ({ rank: c.rank as Rank, suit: c.suit as Suit })));
}

/** Deals and waits until the player may act; the dealer's cards must still be hidden. */
async function deal(page: Page): Promise<Card[]> {
  await dealButton(page).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator('[data-hand="player"] [data-rank]')).toHaveCount(3);
  await expect(page.locator('[data-hand="dealer"] [data-hole]')).toHaveCount(3);
  await expect(page.locator('[data-hand="dealer"] [data-rank]')).toHaveCount(0);
  return cardsOf(page, 'player');
}

/** Plays or folds and waits until the dealer's cards are up and the bets are paid. */
async function act(page: Page, decision: Decision): Promise<Card[]> {
  await (decision === 'play' ? playButton(page) : foldButton(page)).click();
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator('[data-hand="dealer"] [data-rank]')).toHaveCount(3);
  await expect(page.locator('[data-hand="dealer"] [data-hole]')).toHaveCount(0);
  return cardsOf(page, 'dealer');
}

const signed = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const signedMoney = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

test('a played hand shows its exact value and settles every bet by the rules', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await firstAnte(page); // Ante 5
  await anteSpot(page).click(); // Ante 10
  await pairPlusSpot(page).click(); // Pair Plus 5
  await expect(bankroll(page)).toHaveText('985');
  await expect(onTable(page)).toHaveText('15');
  // Each spot tells screen readers what is on it, next to its name.
  await expect(anteSpot(page)).toHaveAccessibleDescription('10');
  await expect(pairPlusSpot(page)).toHaveAccessibleDescription('5');

  const player = await deal(page);
  expect(new Set(player.map((c) => `${c.rank}${c.suit}`)).size).toBe(3);

  // The live panel is the exact enumeration for these three cards.
  const odds = handOdds(player);
  await expect(page.locator('[data-ev="play"]')).toContainText(signed(odds.evPlay, 3));
  await expect(page.locator('[data-ev="fold"]')).toContainText('−1.000');
  // Those are the Ante & Play bets only, and the panel says so: Pair Plus is on the table too.
  await expect(page.getByTestId('tcp-ev').getByRole('heading')).toHaveText('This hand — exact value of the Ante & Play bets');
  await expect(page.getByTestId('tcp-ev')).toContainText('Pair Plus is not included');
  await expect(page.locator(`[data-ev="${odds.best}"]`)).toHaveAttribute('data-best', 'true');
  await expect(page.locator('[data-case="notQualified"] dd')).toHaveText(`${((odds.notQualified / 18424) * 100).toFixed(2)}%`);
  // … and the hint is the Q-6-4 rule applied to them.
  await expect(page.getByTestId('tcp-hint')).toHaveAttribute('data-decision', decide('optimal', player));

  const dealer = await act(page, 'play');
  expect(new Set([...player, ...dealer].map((c) => `${c.rank}${c.suit}`)).size).toBe(6);
  const bets: Bets = { ante: 10, pairPlus: 5 };
  const result = settle(bets, 'play', player, dealer);
  // 985 after the bets, 10 more for the Play bet, then whatever comes back.
  await expect(bankroll(page)).toHaveText(String(985 - 10 + result.returned));
  await expect(onTable(page)).toHaveText('0');
  await expect(page.getByTestId('tcp-hand-net')).toHaveText(signedMoney(result.net));
  await expect(page.getByTestId('dealer-hand')).toHaveAttribute('data-qualifies', String(result.dealerQualifies));
  const lines = page.getByTestId('tcp-results').locator('li[data-outcome]');
  await expect(lines).toHaveCount(result.lines.length);
  for (const [i, line] of result.lines.entries()) {
    await expect(lines.nth(i)).toHaveAttribute('data-line', line.id);
    await expect(lines.nth(i)).toHaveAttribute('data-outcome', line.outcome);
  }
  // The Ante Bonus appears exactly when the hand is a straight or better.
  const category = evaluate(player).category;
  const bonus = category === 'straight' || category === 'threeOfAKind' || category === 'straightFlush';
  await expect(page.locator('li[data-line="anteBonus"]')).toHaveCount(bonus ? 1 : 0);
});

test('folding forfeits the Ante and Pair Plus and still shows the dealer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await firstAnte(page);
  await pairPlusSpot(page).click();
  await expect(bankroll(page)).toHaveText('990');

  const player = await deal(page);
  const dealer = await act(page, 'fold');
  expect(settle({ ante: 5, pairPlus: 5 }, 'fold', player, dealer).returned).toBe(0);
  await expect(bankroll(page)).toHaveText('990');
  await expect(onTable(page)).toHaveText('0');
  await expect(page.getByTestId('tcp-callout')).toHaveText('You folded · −10');
  // Readable red on the light panel (6.4:1), not the felt's brighter one.
  await expect(page.getByTestId('tcp-callout').locator('span')).toHaveCSS('color', 'rgb(185, 28, 28)');
  await expect(page.getByTestId('tcp-results').locator('li[data-outcome]')).toHaveCount(2);
  await expect(page.locator('li[data-line="ante"]')).toHaveAttribute('data-outcome', 'lose');
  await expect(page.locator('li[data-line="pairPlus"]')).toHaveAttribute('data-outcome', 'lose');
  await expect(page.locator('li[data-line="play"]')).toHaveCount(0);
});

test('rebet and a run of hands on the strategy keep the books straight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await firstAnte(page);
  let expected = 1000;
  let played = 0;
  for (let i = 0; i < 10; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Rebet' }).click();
    await expect(onTable(page)).toHaveText('5');
    const player = await deal(page);
    const decision = decide('optimal', player);
    await expect(page.getByTestId('tcp-hint')).toHaveAttribute('data-decision', decision);
    const dealer = await act(page, decision);
    expected += settle({ ante: 5, pairPlus: 0 }, decision, player, dealer).net;
    if (decision === 'play') played++;
    await expect(bankroll(page)).toHaveText(String(expected));
    await expect(onTable(page)).toHaveText('0');
  }
  const stats = page.getByTestId('tcp-stats');
  await expect(stats).toContainText('Hands10');
  await expect(stats).toContainText(`Played${played}`);
  await expect(stats).toContainText('Agreed with the strategy100%');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(bankroll(page)).toHaveText('1000');
  await expect(page.locator('[data-hand="player"] [data-rank]')).toHaveCount(0);
  await expect(page.getByTestId('tcp-callout')).toHaveText('Place your Ante, then deal.');
});

test('the table asks for an Ante and for enough behind it to play', async ({ page }) => {
  await openGame(page);
  await expect(async () => {
    await dealButton(page).click({ timeout: 1_000 });
    await expect(message(page)).toHaveText('Put a chip on the Ante first.', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(playButton(page)).toBeDisabled();
  await expect(foldButton(page)).toBeDisabled();

  // Pair Plus alone is not enough to be dealt in.
  await pairPlusSpot(page).click();
  await dealButton(page).click();
  await expect(message(page)).toHaveText('Put a chip on the Ante first.');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(bankroll(page)).toHaveText('1000');

  // The whole bankroll on the Ante leaves nothing for the Play bet.
  await page.getByRole('radio', { name: 'Chip 500' }).click();
  await anteSpot(page).click();
  await anteSpot(page).click();
  await expect(bankroll(page)).toHaveText('0');
  await dealButton(page).click();
  await expect(message(page)).toContainText('Keep 1000 behind for the Play bet');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(bankroll(page)).toHaveText('500');
});

test('switching tabs mid-hand does not drop the hand', async ({ page }) => {
  await openGame(page);
  await firstAnte(page);
  await dealButton(page).click();
  await expect(page.getByRole('button', { name: 'Dealing…' })).toBeVisible();
  await page.getByRole('tab', { name: 'Odds' }).click();
  await page.waitForTimeout(2_500);
  await page.getByRole('tab', { name: 'Table' }).click();
  // The deal finished while the tab was hidden and is waiting for a decision.
  await expect(playButton(page)).toBeEnabled();
  await expect(page.locator('[data-hand="player"] [data-rank]')).toHaveCount(3);
  await expect(onTable(page)).toHaveText('5');

  await playButton(page).click();
  await page.getByRole('tab', { name: 'Simulation' }).click();
  await page.waitForTimeout(2_500);
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(dealButton(page)).toBeEnabled();
  await expect(page.locator('[data-hand="dealer"] [data-rank]')).toHaveCount(3);
  await expect(onTable(page)).toHaveText('0');
  await expect(page.getByTestId('tcp-stats')).toContainText('Hands1');
});

test('the odds tab shows the exact counts and reprices Pair Plus', async ({ page }) => {
  await openGame(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('edge-ante')).toHaveText('3.37%');
  await expect(page.getByTestId('element-of-risk')).toHaveText('2.01%');
  await expect(page.getByTestId('dealer-qualifies')).toHaveText('69.59%');
  await expect(page.getByTestId('play-rate')).toHaveText('67.42%');
  await expect(page.getByTestId('total-combinations')).toHaveText('407,170,400');
  await expect(page.getByTestId('ways-straightFlush')).toHaveText('48');
  await expect(page.getByTestId('ways-highCard')).toHaveText('16,440');
  await expect(page.getByTestId('edge-strategy-always')).toHaveText('7.65%');
  await expect(page.locator('tr[data-hand="Q64"]')).toHaveAttribute('data-best', 'play');
  await expect(page.locator('tr[data-hand="Q63"]')).toHaveAttribute('data-best', 'fold');
  await expect(page.getByTestId('tcp-ev-curve')).toBeVisible();

  await expect(page.getByTestId('pairplus-return')).toHaveText('−7.28%');
  await expect(async () => {
    await page.getByRole('radio', { name: '1-4-6-30-40（元の配当）' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('pairplus-return')).toHaveText('−2.32%', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('tr[data-category="flush"] td').nth(3)).toHaveText('4:1');
  // Both edges stay on show whichever table is selected.
  await expect(page.getByTestId('edge-pairplus-standard')).toHaveText('7.28%');
  await expect(page.getByTestId('edge-pairplus-old')).toHaveText('2.32%');
});

test('the simulation tab plays the three strategies through the real rules', async ({ page }) => {
  await openGame(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Three strategies on the same cards' }) });
  await section.getByRole('combobox').selectOption('10000');
  await expect(async () => {
    await section.getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('tcp-sim-table')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  const table = page.getByTestId('tcp-sim-table');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table).toContainText('Simulated (10,000 hands)');
  // Exact edges alongside, and the never-fold strategy plays every hand.
  await expect(table.locator('tr[data-strategy="optimal"] td').nth(2)).toHaveText('3.373%');
  await expect(table.locator('tr[data-strategy="mimic"] td').nth(2)).toHaveText('3.449%');
  await expect(table.locator('tr[data-strategy="always"] td').nth(2)).toHaveText('7.654%');
  await expect(table.locator('tr[data-strategy="always"] td').nth(3)).toHaveText('100.00%');
  const optimalPlayed = await table.locator('tr[data-strategy="optimal"] td').nth(3).textContent();
  expect(parseFloat(optimalPlayed ?? '')).toBeGreaterThan(64);
  expect(parseFloat(optimalPlayed ?? '')).toBeLessThan(71);
  await expect(page.locator('[data-series]')).toHaveCount(3);
  await expect(page.getByTestId('tcp-sim-note')).toContainText('exact: 69.59%');
  // Dark label on the green Run button.
  await expect(section.getByRole('button', { name: 'Run' })).toHaveCSS('color', 'rgb(4, 20, 10)');
});
