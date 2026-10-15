import { test, expect, type Page } from '@playwright/test';

import { resolveRoll, totalOnTable, type Dice } from '../../src/components/game/Craps/engine';
import { NOT_MONEY_EN, NOT_MONEY_JA } from '../../src/components/game/Craps/i18n';
import { TABLE_KEY, parseTable, unreadKey } from '../../src/components/game/Craps/medalTable';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { bankBalance, openCenter, resetAtCenter } from './medalCenterPage';
import { arrived } from './streamedPage';

// Random rolls are read back from the table and checked against the engine;
// scripted rolls force the dice through Math.random (rollDice draws twice).
// The table plays with the medals of the Medal Game Center: a new guest has a new member's 100.

async function openCraps(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/craps');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(page.locator('[data-rolling]')).toBeVisible();
  await expect(page.getByTestId('craps-counter')).toHaveAttribute('data-loaded', 'true');
}

const play = (page: Page) => page.locator('#craps-panel-play');
const medalsShown = (page: Page) => page.getByTestId('craps-medals');
const onTable = (page: Page) => page.getByTestId('craps-on-table');
const betSpot = (page: Page, name: RegExp) => play(page).getByRole('button', { name });

/** Clicks the Pass Line until hydration has attached handlers and the table holds the player's medals. */
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

/** The table this browser keeps for a guest. */
const storedTable = async (page: Page) => parseTable(await page.evaluate((key) => window.localStorage.getItem(key), TABLE_KEY));

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test('the dice land on what the table announces, and bets settle by the rules, in medals', async ({ page }) => {
  await openCraps(page);
  await expect(medalsShown(page)).toHaveText(String(WELCOME));
  await firstBet(page); // Pass 5
  await betSpot(page, /^Field/).click(); // Field 5
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 10));

  const dice = await rollAndSettle(page);
  // The dice on the felt show the drawn faces.
  const faces = await page.locator('[data-die]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.face)));
  expect(faces).toEqual([...dice]);

  const expected = resolveRoll(null, { pass: 5, field: 5 }, dice);
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 10 + expected.returned));
  await expect(onTable(page)).toHaveText(String(totalOnTable(expected.bets)));
  await expect(page.getByTestId('craps-callout')).toContainText(String(dice[0] + dice[1]));
  await expect(page.getByRole('list', { name: 'Recent rolls' }).locator('li[data-event]')).toHaveCount(1);
  // The medals are the Medal Game Center's: what the table shows is what is kept.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 10 + expected.returned);
});

test('a scripted hand in medals: point, odds, point made, then a seven-out', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCraps(page);
  await firstBet(page);
  await betSpot(page, /^Pass Line \(1:1\)/).click(); // Pass 10
  await expect(medalsShown(page)).toHaveText('90');

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

  // BET 50 on the odds: the full 5× the Pass (50), and a press more is over the limit.
  await play(page).getByRole('radio', { name: 'BET 50 medals', exact: true }).click();
  await betSpot(page, /^Pass odds/).click();
  await expect(onTable(page)).toHaveText('60');
  await betSpot(page, /^Pass odds/).click();
  await expect(page.getByTestId('craps-message')).toContainText('max 50 medals');
  await expect(onTable(page)).toHaveText('60');
  // Place the 6: a press of BET 1 puts on 6, as the 6 pays 7 for 6.
  await play(page).getByRole('radio', { name: 'BET 1 medal', exact: true }).click();
  await betSpot(page, /^Place 6/).click();
  await expect(page.getByTestId('craps-message')).toContainText('takes medals in 6s');
  await expect(medalsShown(page)).toHaveText('34');
  await expect(onTable(page)).toHaveText('66');

  // 1+5 = 6: point made. Pass 1:1 (+10), odds 6:5 (+60), place 6 pays 7:6 (+7) and stays up.
  await forceNextRoll(page, [1, 5]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-callout')).toContainText('point made');
  await expect(medalsShown(page)).toHaveText(String(34 + 20 + 110 + 7));
  await expect(onTable(page)).toHaveText('6');
  await expect(page.getByTestId('craps-puck')).toHaveCount(0);

  // New come-out: bet the line, 4+4 sets the point at 8 (place 6 was off on the come-out).
  await play(page).getByRole('radio', { name: 'BET 10 medals', exact: true }).click();
  await betSpot(page, /^Pass Line \(1:1\)/).click();
  await forceNextRoll(page, [4, 4]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-message')).toHaveText('The point is 8');
  await expect(onTable(page)).toHaveText('16');

  // 3+4: seven-out sweeps the Pass and the place bet.
  await forceNextRoll(page, [3, 4]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-callout')).toContainText('seven out');
  await expect(medalsShown(page)).toHaveText(String(171 - 10));
  await expect(onTable(page)).toHaveText('0');
  await expect(page.getByTestId('craps-net')).toHaveText('+61');
  await expect.poll(() => bankBalance(page)).toBe(161);

  const stat = (label: string) => page.locator('dl div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
  await expect(stat('Rolls')).toHaveText('4');
  await expect(stat('Points made')).toHaveText('1');
  await expect(stat('Seven-outs')).toHaveText('1');
  await expect(stat('Shooter')).toHaveText('#2');
});

test('a bet takes medals, a win adds them, and the Medal Game Center shows the same count after a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCraps(page);
  await firstBet(page); // Pass 5
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 5));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 5);
  // 5 + 6 on the come-out: the Pass Line wins 5 more.
  await forceNextRoll(page, [5, 6]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-won')).toHaveText('Won 10 medals');
  await expect(medalsShown(page)).toHaveText(String(WELCOME + 5));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME + 5);

  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('craps-counter')).toHaveAttribute('data-loaded', 'true');
  await expect(medalsShown(page)).toHaveText(String(WELCOME + 5));
  // The roll is still on the record after the reload.
  await expect(page.getByRole('list', { name: 'Recent rolls' }).locator('li[data-event]')).toHaveCount(1);

  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME + 5));
  // Craps is open on the floor, with a way in.
  await expect(page.getByTestId('center-play-craps')).toHaveAttribute('href', '/games/craps');
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME + 5));
});

test('the bets on the table stay there through a reload, with the medals they hold', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCraps(page);
  await firstBet(page); // Pass 5
  await forceNextRoll(page, [3, 3]);
  await rollAndSettle(page); // the point is 6
  await betSpot(page, /^Place 8/).click(); // BET 5 rounds up to 6 on the 8
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 11));
  await expect(onTable(page)).toHaveText('11');

  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('craps-counter')).toHaveAttribute('data-loaded', 'true');
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 11));
  await expect(onTable(page)).toHaveText('11');
  await expect(page.getByTestId('craps-puck')).toBeVisible();
  await expect(betSpot(page, /^Place 8/)).toHaveAccessibleName(/6 medals on it/);
  expect((await storedTable(page))?.bets).toEqual({ pass: 5, place8: 6 });
  expect(await bankBalance(page)).toBe(WELCOME - 11);

  // They play on from there: 4 + 4 pays the place 8 its 7, and it stays up.
  await forceNextRoll(page, [4, 4]);
  await rollAndSettle(page);
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 11 + 7));
  await expect(onTable(page)).toHaveText('11');
  // Take down brings back the place bet; the Pass stays with its point on.
  await page.getByTestId('craps-take-down').click();
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 11 + 7 + 6));
  await expect(onTable(page)).toHaveText('5');
});

test('another tab takes the medals: this table waits, and plays again when asked to', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCraps(page);
  await firstBet(page);
  const other = await context.newPage();
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await openCraps(other);
  // The first tab waits, says why, and takes no bets.
  await expect(page.getByTestId('craps-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('craps-play-here')).toHaveText('Play here');
  await expect(page.getByRole('button', { name: 'ROLL', exact: true })).toBeDisabled();
  // The second plays the same table, from the same medals.
  await expect(onTable(other)).toHaveText('5');
  await expect(medalsShown(other)).toHaveText(String(WELCOME - 5));
  await betSpot(other, /^Field/).click();
  await expect(medalsShown(other)).toHaveText(String(WELCOME - 10));

  // Back to the first: it has the medals, and the table the second left; the second waits.
  await page.bringToFront();
  await page.getByTestId('craps-play-here').click();
  await expect(page.getByTestId('craps-card-away')).toHaveCount(0);
  await expect(other.getByTestId('craps-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(onTable(page)).toHaveText('10');
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 10));
  await page.getByTestId('craps-take-down').click();
  await expect(medalsShown(page)).toHaveText(String(WELCOME));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME);
});

test('a reset at the Medal Game Center clears the table, whose bets went with the medals', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCraps(page);
  await firstBet(page);
  await forceNextRoll(page, [5, 5]);
  await rollAndSettle(page); // the point is 10
  await play(page).getByRole('radio', { name: 'BET 10 medals', exact: true }).click();
  await betSpot(page, /^Pass odds/).click();
  await expect(onTable(page)).toHaveText('15');

  await resetAtCenter(page);
  await openCraps(page);
  await expect(medalsShown(page)).toHaveText(String(WELCOME));
  await expect(onTable(page)).toHaveText('0');
  await expect(page.getByTestId('craps-callout')).toHaveText('Coming out');
  await expect(page.getByTestId('craps-puck')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Recent rolls' }).locator('li[data-event]')).toHaveCount(0);
  await expect.poll(async () => (await storedTable(page))?.bets ?? null).toEqual({});
  expect(await bankBalance(page)).toBe(WELCOME);
});

test('says once that the table plays with medals now, at a phone’s width, with the note that medals are not money', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openCraps(page);
  const notice = page.getByTestId('craps-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Craps now plays with your medals');
  await expect(page.getByTestId('craps-notice-center')).toHaveAttribute('href', '/games/medal-center');
  await expect(page.getByTestId('craps-not-money')).toHaveText(NOT_MONEY_EN);
  await expect(page.getByTestId('craps-center')).toHaveAttribute('href', '/games/medal-center');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  await page.getByTestId('craps-notice-close').click();
  await expect(notice).toHaveCount(0);
  // Once: it is not shown again.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('craps-counter')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('craps-notice')).toHaveCount(0);

  await openCraps(page, 'ja');
  await expect(page.locator('#craps-counter-label')).toHaveText('持ちメダル');
  await expect(page.getByTestId('craps-not-money')).toHaveText(NOT_MONEY_JA);
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});

test('a craps table kept under the table’s name that cannot be read does not stop the game, and turns into no medals', async ({ page }) => {
  const old = JSON.stringify({ bankroll: 1000, bets: { pass: 25 }, point: 6 });
  await page.addInitScript(
    ([key, text]) => {
      if (window.localStorage.getItem(`${key}#seeded`) === null) {
        window.localStorage.setItem(key, text);
        window.localStorage.setItem(`${key}#seeded`, '1');
      }
    },
    [TABLE_KEY, old],
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openCraps(page);
  await expect(medalsShown(page)).toHaveText(String(WELCOME));
  await expect(onTable(page)).toHaveText('0');
  await firstBet(page);
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 5));
  expect(await page.evaluate((key) => window.localStorage.getItem(key), unreadKey(null))).toBe(old);
  expect((await storedTable(page))?.bets).toEqual({ pass: 5 });
  expect(errors).toEqual([]);
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

test('the exact odds tab shows the published numbers, and the medals each fractional bet takes at a time', async ({ page }) => {
  await openCraps(page);
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await expect(page.getByTestId('pass-win')).toHaveText('244/495 = 49.293%');
  await expect(page.getByTestId('edge-dontPass')).toHaveText('1.364%');
  await expect(page.getByTestId('edge-any7')).toHaveText('16.667%');
  await expect(page.getByTestId('expected-rolls')).toHaveText('8.53');
  await expect(page.locator('tr[data-strategy="3-4-5x"]')).toContainText('0.374%');
  await expect(page.locator('tr[data-whole="place-6"]')).toContainText('6s');
  await expect(page.locator('tr[data-whole="passOdds-5"]')).toContainText('2s');
});

test('the simulations compare strategies, sessions and hand lengths, and leave the medals alone', async ({ page }) => {
  await openCraps(page);
  await expect(medalsShown(page)).toHaveText(String(WELCOME));
  await page.getByRole('tab', { name: 'Simulation' }).click();
  await expect(page.getByTestId('craps-sim-own-medals')).toBeVisible();

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
  expect(await bankBalance(page)).toBe(WELCOME);
  await expect(medalsShown(page)).toHaveText(String(WELCOME));
});

test('craps is localized', async ({ page }) => {
  await openCraps(page, 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('クラップス');
  await expect(page.getByRole('tab', { name: '正確な確率' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^パスライン（1:1）/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: '5枚ベット' })).toBeVisible();
  await expect(page.getByTestId('craps-center')).toContainText('メダルゲームセンター');
});
