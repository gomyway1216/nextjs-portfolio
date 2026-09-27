import { test, expect, type Page } from '@playwright/test';

import { resolveRoll, totalOnTable, type Dice } from '../../src/components/game/Craps/engine';

// Random rolls are read back from the table and checked against the engine;
// scripted rolls force the dice through Math.random (rollDice draws twice).

async function openCraps(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/craps');
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-rolling]')).toBeVisible();
}

const bankroll = (page: Page) => page.getByTestId('craps-bankroll');
const onTable = (page: Page) => page.getByTestId('craps-on-table');
const betSpot = (page: Page, name: RegExp) => page.getByRole('button', { name });

/** Clicks the Pass Line until hydration has attached handlers. */
async function firstBet(page: Page) {
  await expect(async () => {
    await betSpot(page, /^Pass Line \(1:1\)/).click({ timeout: 1_000 });
    await expect(onTable(page)).not.toHaveText('0', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function rollAndSettle(page: Page): Promise<Dice> {
  await page.getByRole('button', { name: 'ROLL', exact: true }).click();
  const tray = page.locator('[data-rolling]');
  await expect(tray).toHaveAttribute('data-rolling', 'false', { timeout: 10_000 });
  const label = (await tray.getAttribute('aria-label')) ?? '';
  const m = label.match(/Dice: (\d) and (\d)/);
  expect(m, label).not.toBeNull();
  return [Number(m![1]), Number(m![2])];
}

async function forceNextRoll(page: Page, dice: Dice) {
  // 1 + floor(r × 6) = face  →  r = (face − 0.5) / 6
  await page.evaluate(([a, b]) => {
    const w = window as unknown as { __random?: () => number };
    w.__random ??= Math.random;
    const queue = [(a - 0.5) / 6, (b - 0.5) / 6];
    Math.random = () => (queue.length ? queue.shift()! : w.__random!());
  }, dice);
}

test('the dice land on what the table announces, and bets settle by the rules', async ({ page }) => {
  await openCraps(page);
  await firstBet(page); // Pass 5
  await betSpot(page, /^Field/).click(); // Field 5
  await expect(bankroll(page)).toHaveText('990');

  const dice = await rollAndSettle(page);
  // The dice on the felt show the drawn faces.
  const faces = await page.locator('[data-die]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.face)));
  expect(faces).toEqual([...dice]);

  const expected = resolveRoll(null, { pass: 5, field: 5 }, dice);
  await expect(bankroll(page)).toHaveText(String(990 + expected.returned));
  await expect(onTable(page)).toHaveText(String(totalOnTable(expected.bets)));
  await expect(page.getByTestId('craps-callout')).toContainText(String(dice[0] + dice[1]));
  await expect(page.getByRole('list', { name: 'Recent rolls' }).locator('li[data-event]')).toHaveCount(1);

  // Reset starts a fresh table: bankroll, history and the dice themselves.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(bankroll(page)).toHaveText('1000');
  await expect(page.getByTestId('craps-callout')).toHaveText('Coming out');
  await expect(page.locator('[data-rolling]')).toHaveAttribute('aria-label', 'Craps table with two dice');
  await expect(page.locator('[data-die]').first()).toHaveAttribute('data-face', '5');
  await expect(page.locator('[data-die]').nth(1)).toHaveAttribute('data-face', '2');
  expect(await page.locator('[data-die]').first().evaluate((el) => (el as HTMLElement).style.left)).toBe('72%');
  await expect(page.getByRole('list', { name: 'Recent rolls' }).locator('li[data-event]')).toHaveCount(0);
});

test('a scripted hand: point, odds, point made, then a seven-out', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCraps(page);
  await firstBet(page);
  await betSpot(page, /^Pass Line \(1:1\)/).click(); // Pass 10
  await expect(bankroll(page)).toHaveText('990');

  // Odds need a point first.
  await betSpot(page, /^Pass odds/).click();
  await expect(page.getByTestId('craps-message')).toContainText('only after a point is set');

  // Come-out 2+4 = 6: the point is 6.
  await forceNextRoll(page, [2, 4]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-puck')).toBeVisible();
  await expect(betSpot(page, /^Place 6/)).toContainText('ON');
  await expect(page.getByTestId('craps-message')).toHaveText('The point is 6');
  // Line bets are closed once the point is on.
  await betSpot(page, /^Don't Pass/).click();
  await expect(page.getByTestId('craps-message')).toContainText('only be made on the come-out');

  // Back the Pass with the full 5× odds (50), then one chip too many.
  await page.getByRole('radio', { name: 'Chip 25', exact: true }).click();
  await betSpot(page, /^Pass odds/).click();
  await betSpot(page, /^Pass odds/).click();
  await betSpot(page, /^Pass odds/).click();
  await expect(page.getByTestId('craps-message')).toContainText('max 50');
  // Place the 6 for 6.
  await page.getByRole('radio', { name: 'Chip 1', exact: true }).click();
  for (let i = 0; i < 6; i++) await betSpot(page, /^Place 6/).click();
  await expect(bankroll(page)).toHaveText('934');
  await expect(onTable(page)).toHaveText('66');

  // 1+5 = 6: point made. Pass 1:1 (+10), odds 6:5 (+60), place 6 pays 7:6 (+7) and stays up.
  await forceNextRoll(page, [1, 5]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-callout')).toContainText('point made');
  await expect(bankroll(page)).toHaveText(String(934 + 20 + 110 + 7));
  await expect(onTable(page)).toHaveText('6');
  await expect(page.getByTestId('craps-puck')).toHaveCount(0);

  // New come-out: bet the line, 4+4 sets the point at 8 (place 6 was off on the come-out).
  await page.getByRole('radio', { name: 'Chip 10', exact: true }).click();
  await betSpot(page, /^Pass Line \(1:1\)/).click();
  await forceNextRoll(page, [4, 4]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-message')).toHaveText('The point is 8');
  await expect(onTable(page)).toHaveText('16');

  // 3+4: seven-out sweeps the Pass and the place bet.
  await forceNextRoll(page, [3, 4]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-callout')).toContainText('seven out');
  await expect(bankroll(page)).toHaveText(String(1071 - 10));
  await expect(onTable(page)).toHaveText('0');

  const stat = (label: string) => page.locator('dl div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
  await expect(stat('Rolls')).toHaveText('4');
  await expect(stat('Points made')).toHaveText('1');
  await expect(stat('Seven-outs')).toHaveText('1');
  await expect(stat('Shooter')).toHaveText('#2');
});

test('switching to the odds tab mid-throw keeps the roll', async ({ page }) => {
  await openCraps(page);
  await firstBet(page);
  await page.getByRole('button', { name: 'ROLL', exact: true }).click();
  await expect(page.locator('[data-rolling]')).toHaveAttribute('data-rolling', 'true');
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await expect(page.getByTestId('edge-pass')).toHaveText('1.414%');
  await expect(page.locator('[data-rolling]')).toHaveAttribute('data-rolling', 'false', { timeout: 10_000 });
  await page.getByRole('tab', { name: 'Play' }).click();
  await expect(page.getByRole('list', { name: 'Recent rolls' }).locator('li[data-event]')).toHaveCount(1);
});

test('the exact odds tab shows the published numbers', async ({ page }) => {
  await openCraps(page);
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await expect(page.getByTestId('pass-win')).toHaveText('244/495 = 49.293%');
  await expect(page.getByTestId('edge-dontPass')).toHaveText('1.364%');
  await expect(page.getByTestId('edge-any7')).toHaveText('16.667%');
  await expect(page.getByTestId('expected-rolls')).toHaveText('8.53');
  await expect(page.locator('tr[data-strategy="3-4-5x"]')).toContainText('0.374%');
});

test('the simulations compare strategies, sessions and hand lengths', async ({ page }) => {
  await openCraps(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();

  await page.getByLabel('Number of rolls').selectOption('10000');
  await page.getByRole('button', { name: 'Run' }).first().click();
  const edges = page.getByTestId('craps-sim-edges');
  await expect(edges).toBeVisible({ timeout: 20_000 });
  await expect(edges.locator('tr[data-strategy]')).toHaveCount(6);
  await expect(edges.locator('tr[data-strategy="any7"]')).toContainText('16.667%');
  await expect(edges).toContainText('After 10,000 rolls');

  await page.getByLabel('Players (sessions)').fill('200');
  await page.getByRole('button', { name: 'Run' }).nth(1).click();
  const sessions = page.getByTestId('craps-sim-sessions');
  await expect(sessions).toBeVisible({ timeout: 20_000 });
  await expect(sessions).toContainText('Finished ahead');

  await page.getByLabel('Number of hands').selectOption('1000');
  await page.getByRole('button', { name: 'Run' }).nth(2).click();
  await expect(page.getByTestId('craps-sim-hands')).toContainText('1,000 hands averaged', { timeout: 20_000 });
  await expect(page.getByTestId('craps-sim-hands')).toContainText('(exact 8.53)');
});

test('craps is localized', async ({ page }) => {
  await openCraps(page, 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('クラップス');
  await expect(page.getByRole('tab', { name: '正確な確率' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^パスライン（1:1）/ })).toBeVisible();
});
