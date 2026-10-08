import { test, expect, type Page } from '@playwright/test';

import { SCENARIOS, START_BANKROLL, fixedFractionPath, isFinished, kellyFraction } from '../../src/components/game/KellyCriterion/engine';
import { exactFor } from '../../src/components/game/KellyCriterion/sim';

// The coin is random: the tests read the flips off the page, replay them
// through the engine and compare the money.

async function openGame(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/kelly-criterion');
  expect(response?.status()).toBe(200);
  // While the page streams in, React briefly keeps a second, hidden copy of the
  // content in the document. Wait until there is one before looking anything up.
  await expect(page.getByTestId('kelly-message')).toHaveCount(1);
  await expect(play(page).getByTestId('kelly-message')).toBeVisible();
}

// Every tab panel stays mounted, so everything is looked up inside its own panel.
const play = (page: Page) => page.locator('#kelly-panel-play');
const formula = (page: Page) => page.locator('#kelly-panel-formula');
const sim = (page: Page) => page.locator('#kelly-panel-sim');
const bankroll = (page: Page) => play(page).getByTestId('kelly-bankroll');
const flipCount = (page: Page) => play(page).getByTestId('kelly-flips');
const flipButton = (page: Page) => play(page).getByRole('button', { name: 'FLIP', exact: true });
const quick = (page: Page, fraction: number) => play(page).locator(`[data-quick="${fraction}"]`);
const money = (amount: number) => `$${amount.toFixed(2)}`;

/** The flips so far, as the page records them: `true` is heads. */
async function flipsOnPage(page: Page): Promise<boolean[]> {
  const sequence = (await play(page).getByTestId('kelly-recent').getAttribute('data-flips')) ?? '';
  return [...sequence].map((face) => face === 'H');
}

/** Chooses a quick stake, retrying until hydration has attached the handlers. */
async function chooseStake(page: Page, fraction: number) {
  await expect(async () => {
    await quick(page, fraction).click({ timeout: 1_000 });
    await expect(quick(page, fraction)).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test('one flip stakes what the slider says and pays even money', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await chooseStake(page, 0.2);
  await expect(play(page).getByTestId('kelly-stake')).toHaveText('20% of your bankroll = $5.00');

  await flipButton(page).click();
  await expect(flipCount(page)).toHaveText('1 / 300');
  const [heads] = await flipsOnPage(page);
  await expect(bankroll(page)).toHaveText(heads ? '$30.00' : '$20.00');
  await expect(play(page).getByTestId('kelly-message')).toHaveText(heads ? 'Heads — you win $5.00' : 'Tails — you lose $5.00');
  await expect(play(page).getByTestId('kelly-coin')).toHaveAttribute('data-face', heads ? 'heads' : 'tails');
  // 20% is the Kelly stake, so the comparison line has exactly the same money.
  await expect(play(page).getByTestId('kelly-shadow')).toHaveText(heads ? '$30.00' : '$20.00');
  await expect(play(page).getByTestId('kelly-average-stake')).toHaveText('20%');
  // The next stake is 20% of the new bankroll, not of the old one.
  await expect(play(page).getByTestId('kelly-stake')).toHaveText(`20% of your bankroll = ${heads ? '$6.00' : '$4.00'}`);
});

test('a run of 50 keeps the percentage and matches the engine on the flips shown', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await chooseStake(page, 0.5);
  await play(page).locator('[data-run="50"]').click();
  await expect(flipButton(page)).toHaveText('FLIP');

  const flips = await flipsOnPage(page);
  expect(flips.length).toBeGreaterThan(0);
  expect(flips.length).toBeLessThanOrEqual(50);
  const mine = fixedFractionPath(SCENARIOS.coin60, 0.5, flips);
  const kelly = fixedFractionPath(SCENARIOS.coin60, kellyFraction(SCENARIOS.coin60), flips);
  await expect(bankroll(page)).toHaveText(money(mine[mine.length - 1]));
  await expect(flipCount(page)).toHaveText(`${flips.length} / 300`);
  await expect(play(page).getByTestId('kelly-shadow')).toHaveText(money(kelly[kelly.length - 1]));
  await expect(play(page).getByTestId('kelly-chart-summary')).toHaveText(
    `After ${flips.length} flips you have ${money(mine[mine.length - 1])}. The Kelly stake on the same flips has ${money(kelly[kelly.length - 1])}.`,
  );
  // A run only stops early when the game is over: at the cap, or down to the last cent.
  if (flips.length < 50) expect(isFinished(mine[mine.length - 1], flips.length)).toBe(true);
});

test('all in ends at the first tails, or at the cap after four heads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await chooseStake(page, 1);
  await expect(play(page).getByTestId('kelly-stake')).toHaveText('100% of your bankroll = $25.00');
  await play(page).locator('[data-run="10"]').click();
  await expect(flipButton(page)).toBeDisabled();

  const flips = await flipsOnPage(page);
  const firstTails = flips.indexOf(false);
  if (firstTails >= 0) {
    // $25 → $50 → $100 → $200, then nothing.
    expect(flips.length).toBe(firstTails + 1);
    expect(firstTails).toBeLessThan(4);
    await expect(bankroll(page)).toHaveText('$0.00');
    await expect(play(page).getByTestId('kelly-message')).toContainText(`Bust after ${flips.length} flips.`);
  } else {
    expect(flips).toEqual([true, true, true, true]);
    await expect(bankroll(page)).toHaveText('$250.00');
    await expect(play(page).getByTestId('kelly-message')).toContainText('You reached the $250.00 cap in 4 flips.');
  }
  // Either way the page says what the Kelly stake made of the same flips.
  const kelly = fixedFractionPath(SCENARIOS.coin60, 0.2, flips);
  await expect(play(page).getByTestId('kelly-message')).toContainText(`Staking 20% on every one of the same flips ends with ${money(kelly[kelly.length - 1])}.`);
  await expect(quick(page, 0.2)).toBeDisabled();
});

test('the table asks for a stake, shows the Kelly stake on request, and starts over', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await chooseStake(page, 0.05);
  await play(page).getByLabel('Stake', { exact: true }).fill('0');
  await expect(play(page).getByTestId('kelly-stake')).toHaveText('0% of your bankroll = $0.00');
  await flipButton(page).click();
  await expect(play(page).getByTestId('kelly-message')).toHaveText('Stake something first.');
  await expect(flipCount(page)).toHaveText('0 / 300');

  await expect(play(page).getByTestId('kelly-hint')).toHaveCount(0);
  await play(page).getByLabel('Show the Kelly stake').check();
  await expect(play(page).getByTestId('kelly-hint')).toHaveText('Kelly: 20% of your bankroll, which is $5.00 right now.');

  // Another bet has another Kelly stake; choosing it starts a new game.
  await play(page).getByLabel('The bet').selectOption('longshot');
  await expect(play(page).getByTestId('kelly-hint')).toHaveText('Kelly: 6.25% of your bankroll, which is $1.56 right now.');
  await expect(play(page).getByTestId('kelly-message')).toHaveText('Heads comes up 25% of the time and pays 4 to 1. How much will you stake?');

  await chooseStake(page, 0.1);
  await flipButton(page).click();
  await expect(flipCount(page)).toHaveText('1 / 300');
  const [heads] = await flipsOnPage(page);
  // $2.50 at 4 to 1.
  await expect(bankroll(page)).toHaveText(heads ? '$35.00' : '$22.50');

  await play(page).getByRole('button', { name: 'New game' }).click();
  await expect(flipCount(page)).toHaveText('0 / 300');
  await expect(bankroll(page)).toHaveText(money(START_BANKROLL));
  expect(await flipsOnPage(page)).toEqual([]);
});

test('switching tabs mid-game keeps the game', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await chooseStake(page, 0.1);
  await play(page).locator('[data-run="10"]').click();
  await expect(flipCount(page)).toHaveText('10 / 300');
  const before = await flipsOnPage(page);
  const money = await bankroll(page).textContent();

  await page.getByRole('tab', { name: 'The formula' }).click();
  await expect(formula(page).getByTestId('kelly-fraction')).toHaveText('20%');
  await page.getByRole('tab', { name: 'Play' }).click();
  expect(await flipsOnPage(page)).toEqual(before);
  await expect(bankroll(page)).toHaveText(money!);
});

test('the formula tab works out the Kelly stake for any bet', async ({ page }) => {
  await openGame(page);
  await page.getByRole('tab', { name: 'The formula' }).click();
  await expect(formula(page).getByTestId('kelly-formula')).toHaveText('f* = p − q / b = 0.60 − 0.40 / 1 = 20%');
  await expect(formula(page).getByTestId('kelly-growth')).toHaveText('+2.01%');
  await expect(formula(page).locator('tr[data-strategy="kelly"] [data-col="typical"]')).toHaveText('×420');

  await expect(async () => {
    await formula(page).locator('[data-preset="longshot"]').click({ timeout: 1_000 });
    await expect(formula(page).getByTestId('kelly-fraction')).toHaveText('6.25%', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(formula(page).getByTestId('kelly-formula')).toHaveText('f* = p − q / b = 0.25 − 0.75 / 4 = 6.25%');
  await expect(formula(page).getByTestId('kelly-edge')).toHaveText('+25.0%');
  const longshot = exactFor(SCENARIOS.longshot, 'kelly', 300);
  await expect(formula(page).locator('tr[data-strategy="kelly"] [data-col="below"]')).toHaveText(`${Number((longshot.belowStart * 100).toFixed(1))}%`);
  await expect(formula(page).locator('tr[data-strategy="kelly"] [data-col="half"]')).toHaveText(`${Number((longshot.everHalf * 100).toFixed(1))}%`);

  // More bets, same strategy: the chance of ending behind shrinks.
  await formula(page).getByLabel('Bets', { exact: true }).selectOption('1000');
  const longer = exactFor(SCENARIOS.longshot, 'kelly', 1000);
  await expect(formula(page).locator('tr[data-strategy="kelly"] [data-col="below"]')).toHaveText(`${Number((longer.belowStart * 100).toFixed(1))}%`);

  // A fair coin has nothing to size: Kelly says zero, and the table goes away.
  await formula(page).getByLabel('Payout').selectOption('1');
  await formula(page).getByLabel(/Chance of winning/).fill('50');
  await expect(formula(page).getByTestId('kelly-fraction')).toHaveText('0%');
  await expect(formula(page).getByTestId('kelly-no-edge')).toBeVisible();
  await expect(formula(page).getByTestId('kelly-after-table')).toHaveCount(0);
  await expect(formula(page).getByTestId('kelly-double')).toHaveText('never');
});

test('the simulation lands on the exact numbers', async ({ page }) => {
  await openGame(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  await sim(page).getByLabel('Sessions').selectOption('10000');
  await sim(page).getByLabel('Flips per session').selectOption('100');
  await expect(async () => {
    await sim(page).getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await expect(sim(page).getByTestId('kelly-sim-result')).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 40_000 });

  const table = sim(page).getByTestId('kelly-sim-table');
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.locator('caption')).toContainText('Flips per session: 100 · Sessions: 10,000');
  const kelly = exactFor(SCENARIOS.coin60, 'kelly', 100);
  const cells = table.locator('tr[data-strategy="kelly"] td');
  // Stake, then simulated and exact growth, typical result, below the start, lost half.
  await expect(cells.nth(0)).toHaveText('20%');
  await expect(cells.nth(2)).toHaveText('+2.01%');
  await expect(cells.nth(6)).toHaveText(`${Number((kelly.belowStart * 100).toFixed(1))}%`);
  await expect(cells.nth(8)).toHaveText(`${Number((kelly.everHalf * 100).toFixed(1))}%`);
  const simulatedGrowth = parseFloat(((await cells.nth(1).textContent()) ?? '').replace('+', ''));
  expect(simulatedGrowth).toBeGreaterThan(1.8);
  expect(simulatedGrowth).toBeLessThan(2.2);
  const simulatedHalf = parseFloat((await cells.nth(7).textContent()) ?? '');
  expect(Math.abs(simulatedHalf - kelly.everHalf * 100)).toBeLessThan(3);
  // All in: minus infinity, and nothing left.
  await expect(table.locator('tr[data-strategy="allIn"] td').nth(2)).toHaveText('−∞');
  await expect(table.locator('tr[data-strategy="allIn"] td').nth(4)).toHaveText('×0');
  await expect(sim(page).locator('[data-series]')).toHaveCount(4);
  // Dark label on the green Run button.
  await expect(sim(page).getByRole('button', { name: 'Run' })).toHaveCSS('color', 'rgb(4, 20, 10)');
});

test('the tabs work from the keyboard', async ({ page }) => {
  await openGame(page);
  const tab = (name: string) => page.getByRole('tab', { name });
  // Retry until hydration has attached the key handler.
  await expect(async () => {
    await tab('Play').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab('The formula')).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(tab('The formula')).toBeFocused();
  await expect(formula(page).getByTestId('kelly-formula')).toBeVisible();
  // One tab stop: the selected tab.
  await expect(tab('The formula')).toHaveAttribute('tabindex', '0');
  await expect(tab('Play')).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('End');
  await expect(tab('Simulation')).toBeFocused();
  await expect(tab('Simulation')).toHaveAttribute('aria-selected', 'true');
  // The arrows wrap around.
  await page.keyboard.press('ArrowRight');
  await expect(tab('Play')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab('Simulation')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab('Play')).toHaveAttribute('aria-selected', 'true');
  await expect(play(page).getByTestId('kelly-message')).toBeVisible();
});

test('a long simulation can be cancelled, and the longest sessions allow fewer of them', async ({ page }) => {
  await openGame(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const sessions = sim(page).getByLabel('Sessions');
  await sessions.selectOption('100000');
  // A thousand flips a session: a hundred thousand sessions is no longer on offer.
  await sim(page).getByLabel('Flips per session').selectOption('1000');
  await expect(sessions).toHaveValue('10000');
  await expect(sessions.locator('option')).toHaveText(['1,000', '10,000']);
  await sim(page).getByLabel('Flips per session').selectOption('300');
  await expect(sessions.locator('option')).toHaveText(['1,000', '10,000', '100,000']);

  await sessions.selectOption('100000');
  await expect(async () => {
    await sim(page).getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await sim(page).getByRole('button', { name: 'Cancel' }).click({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(sim(page).getByRole('button', { name: 'Run' })).toBeEnabled();
  await expect(sim(page).getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(sim(page).getByTestId('kelly-sim-result')).toHaveCount(0);
});

test('chart lines keep their contrast on the light theme', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await openGame(page);
  // Dark amber and dark green, not the pale gold and green that suit the dark theme.
  await expect(play(page).locator('[data-line="you"]')).toHaveCSS('stroke', 'rgb(161, 98, 7)');
  await expect(play(page).locator('[data-line="kelly"]')).toHaveCSS('stroke', 'rgb(21, 128, 61)');
});

test('the game is localized', async ({ page }) => {
  await openGame(page, 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ケリー基準');
  await expect(page.getByRole('tab', { name: 'ケリーの式' })).toBeVisible();
  await expect(play(page).getByRole('button', { name: '投げる', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'ケリーの式' }).click();
  await expect(formula(page).getByText('28%が破産しました。')).toBeVisible();
});
