import { test, expect, type Page } from '@playwright/test';

import { resolveRoll, totalOnTable, type Dice } from '../../src/components/game/Craps/engine';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { TABLE_KEY, parseTable, unreadKey } from '../../src/components/game/Craps/medalTable';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { bankBalance, openCenter, resetAtCenter } from './medalCenterPage';
import { onPageError } from './pageErrors';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
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

/** Clicks the Pass Line until hydration has attached handlers and the table holds the player's medals: one bet, never two. */
async function firstBet(page: Page) {
  await pressUntil(betSpot(page, /^Pass Line \(1:1\)/), async () => (await onTable(page).textContent()) !== '0');
}

/** The table, which says when a throw is in the air and which throw last came to rest. */
const felt = (page: Page) => page.getByTestId('craps-table');
/** The table that is shown: the full one on a desk, the half one on a phone. */
const shownTable = (page: Page) => page.locator('[data-table-kind]:visible');
const diceShown = (page: Page) => shownTable(page).locator('[data-die]');
const puck = (page: Page) => shownTable(page).getByTestId('craps-puck');

/** Throws, and waits for this throw to come to rest on the table. */
async function rollAndSettle(page: Page): Promise<Dice> {
  const before = await felt(page).getAttribute('data-settled');
  await page.getByRole('button', { name: 'ROLL', exact: true }).click();
  await expect.poll(() => felt(page).getAttribute('data-settled'), { timeout: 10_000 }).not.toBe(before);
  await expect(felt(page)).toHaveAttribute('data-rolling', 'false');
  const label = (await shownTable(page).getByTestId('craps-dice').textContent()) ?? '';
  const m = label.match(/Dice: (\d) and (\d)/);
  expect(m, label).not.toBeNull();
  return [Number(m![1]), Number(m![2])];
}

/**
 * The next roll comes up `dice`: the two numbers ROLL draws (1 + floor(r × 6) = face, so r = (face − 0.5) / 6), served
 * only to the press that rolls (rigPresses). The page's other callers of Math.random get real ones: on the live site the
 * floor's live strip draws one of its own a moment after the table is playable, and a plain queue gave it the first die.
 */
async function forceNextRoll(page: Page, dice: Dice) {
  await rigPresses(
    page,
    dice.map((face) => (face - 0.5) / 6),
  );
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
  const faces = await diceShown(page).evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.face)));
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
  await expect(puck(page)).toHaveText('ON');
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
  // The roll is still on the record after the reload, and the dice in the tray show it.
  await expect(page.getByRole('list', { name: 'Recent rolls' }).locator('li[data-event]')).toHaveCount(1);
  await expect(diceShown(page).first()).toHaveAttribute('data-face', '5');
  await expect(diceShown(page).nth(1)).toHaveAttribute('data-face', '6');
  await expect(shownTable(page).getByTestId('craps-dice')).toHaveText(/^Dice: 5 and 6/);

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
  await expect(puck(page)).toBeVisible();
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
  onPageError(page, (error) => errors.push(error.message));
  await openCraps(page);
  const notice = page.getByTestId('craps-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Craps now plays with your medals');
  await expect(page.getByTestId('craps-notice-center')).toHaveAttribute('href', '/games/medal-center');
  await expect(page.getByTestId('craps-not-money')).toHaveText(NOT_MONEY.en);
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
  await expect(page.getByTestId('craps-not-money')).toHaveText(NOT_MONEY.ja);
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
  onPageError(page, (error) => errors.push(error.message));
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
  await expect(felt(page)).toHaveAttribute('data-rolling', 'true');
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await expect(page.getByTestId('edge-pass')).toHaveText('1.414%');
  await expect(felt(page)).toHaveAttribute('data-rolling', 'false', { timeout: 10_000 });
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

test('a bet tapped on the layout takes medals, and the throw flies to the far wall and lands on the drawn roll, which pays it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCraps(page);
  await expect(shownTable(page)).toHaveAttribute('data-table-kind', 'full');
  await firstBet(page);
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 5));
  await expect(shownTable(page).locator('[data-bet="pass"] [data-amount="5"]')).toBeVisible();
  // Where the first die is on every frame of the throw, read in the page as it moves.
  await page.evaluate(() => {
    const w = window as unknown as { __path?: number[] };
    w.__path = [];
    const sample = () => {
      const die = document.querySelector<HTMLElement>('[data-table-kind="full"] [data-die="0"]');
      const match = die?.style.transform.match(/translate3d\(([-\d.]+)px/);
      if (match) w.__path!.push(Number(match[1]));
      if (w.__path!.length < 400) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await forceNextRoll(page, [5, 6]);
  expect(await rollAndSettle(page)).toEqual([5, 6]);
  expect(await diceShown(page).evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.face)))).toEqual([5, 6]);
  const path = await page.evaluate(() => (window as unknown as { __path: number[] }).__path);
  const width = (await shownTable(page).getByTestId('craps-tub-full').boundingBox())!.width;
  // Thrown from the shooter's end, it reaches the far wall, and comes back off it a little.
  expect(path[0]).toBeGreaterThan(width * 0.8);
  expect(Math.min(...path)).toBeLessThan(width * 0.08);
  expect(path.at(-1)!).toBeGreaterThan(Math.min(...path));
  await expect(page.getByTestId('craps-won')).toHaveText('Won 10 medals');
  await expect(medalsShown(page)).toHaveText(String(WELCOME + 5));
});

test('the layout is played with the keyboard too', async ({ page }) => {
  await openCraps(page);
  const field = betSpot(page, /^Field/);
  await expect(async () => {
    await field.focus({ timeout: 1_000 });
    await page.keyboard.press('Enter');
    await expect(onTable(page)).toHaveText('5', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(field).toBeFocused();
  await page.keyboard.press('Space');
  await expect(onTable(page)).toHaveText('10');
  await expect(field).toHaveAccessibleName(/10 medals on it/);
});

test('the sound switch is the floor’s: off on every visit, the throw heard once it is on, and Quick roll still kept', async ({ page }) => {
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  // A device where the old switch was left on, and every sound the page starts counted, with its length (a headless
  // browser has nothing to listen with). The throw's knocks and clicks are cut from one second of noise.
  await page.addInitScript((key) => {
    if (window.sessionStorage.getItem('seeded') === null) {
      window.localStorage.setItem(key, JSON.stringify({ sound: true, quick: false }));
      window.sessionStorage.setItem('seeded', '1');
    }
    const w = window as unknown as { __sounds: number[] };
    w.__sounds = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>) {
      w.__sounds.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
  }, 'craps-throw'); // PlayTab's THROW_KEY
  const heard = () => page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds);
  await openCraps(page);
  const toggle = page.getByTestId('craps-sound');
  await expect(toggle).toHaveAccessibleName('Sound off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText('🔈 Sound off');
  await firstBet(page);
  // A throw with the sound off is not heard.
  await forceNextRoll(page, [2, 4]);
  await rollAndSettle(page);
  expect(await heard()).toEqual([]);

  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Sound on');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await forceNextRoll(page, [5, 5]);
  await rollAndSettle(page);
  await expect.poll(async () => (await heard()).filter((d) => d === 1).length).toBeGreaterThan(0);

  // Quick roll is still the device's: kept over a reload. The sound is off again.
  await page.getByTestId('craps-quick').click();
  await expect(page.getByTestId('craps-quick')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('craps-counter')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('craps-quick')).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAccessibleName('Sound off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('in Japanese the switch says 音なし, as everywhere on the floor', async ({ page }) => {
  await openCraps(page, 'ja');
  await expect(page.getByTestId('craps-sound')).toHaveText('🔈 音なし');
  await page.getByTestId('craps-sound').click();
  await expect(page.getByTestId('craps-sound')).toHaveText('🔊 音あり');
});

test('with the sound on a medal is heard going down, the dice land on a win to a fanfare, and the counter counts the medals in', async ({ page }) => {
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  // A headless browser has nothing to listen with: every sound the page starts is noted instead, with its length
  // (as in medal-machine-sound.spec.ts). The floor's sounds are the medal set down (0.16 s), the fanfare (0.9 s) and the
  // chirp of a medal counted in (under 0.05 s); the throw's own knocks and clicks are cut from one second of noise.
  await page.addInitScript(() => {
    const w = window as unknown as { __sounds: number[] };
    w.__sounds = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>) {
      w.__sounds.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
  });
  const heard = () => page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds);
  await openCraps(page);
  await firstBet(page); // Pass 5, with the sound off: nothing is heard
  expect(await heard()).toEqual([]);
  await page.getByTestId('craps-sound').click();
  await expect.poll(async () => (await heard()).length).toBe(1);
  await betSpot(page, /^Pass Line \(1:1\)/).click(); // Pass 10
  await expect.poll(async () => (await heard()).length).toBe(2);
  expect((await heard())[1]).toBeCloseTo(0.16, 2);
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 10));

  // Every number the counter's LEDs show from here on.
  await page.evaluate(() => {
    const w = window as unknown as { shownSeen: number[] };
    w.shownSeen = [];
    const led = document.querySelector('[data-testid="craps-medals-led"]')!;
    const read = () => {
      const n = Number(led.getAttribute('data-shown'));
      if (w.shownSeen[w.shownSeen.length - 1] !== n) w.shownSeen.push(n);
    };
    read();
    new MutationObserver(read).observe(led, { attributes: true, attributeFilter: ['data-shown'] });
  });
  // A natural 11: the Pass Line's 10 comes back with 10 more.
  await forceNextRoll(page, [6, 5]);
  expect(await rollAndSettle(page)).toEqual([6, 5]);
  await expect(page.getByTestId('craps-medals-led')).toHaveAttribute('data-shown', String(WELCOME + 10), { timeout: 5_000 });
  await expect(medalsShown(page)).toHaveText(String(WELCOME + 10));
  const seen = await page.evaluate(() => (window as unknown as { shownSeen: number[] }).shownSeen);
  // The counter held still while the dice were in the air, then ran up medal by medal.
  expect(seen[0]).toBe(WELCOME - 10);
  expect(seen[seen.length - 1]).toBe(WELCOME + 10);
  expect(seen.length).toBeGreaterThanOrEqual(5);
  for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  const sounds = (await heard()).slice(2);
  expect(sounds.filter((d) => Math.abs(d - 0.9) < 0.01)).toHaveLength(1);
  expect(sounds.filter((d) => d < 0.05).length).toBeGreaterThanOrEqual(3);

  // A seven-out is silent apart from the dice: no fanfare, nothing counted in.
  await betSpot(page, /^Pass Line \(1:1\)/).click(); // Pass 5
  await forceNextRoll(page, [2, 4]);
  await rollAndSettle(page); // the point is 6
  const quiet = (await heard()).length;
  await forceNextRoll(page, [3, 4]);
  await rollAndSettle(page);
  await page.waitForTimeout(300);
  expect((await heard()).slice(quiet).filter((d) => Math.abs(d - 0.9) < 0.01 || d < 0.05)).toEqual([]);
  expect(errors).toEqual([]);
});

test('on a desk the keys play the table as its buttons do: U takes a medal off, Space and Enter roll, R puts the bets back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCraps(page);
  await expect(page.getByTestId('craps-keys')).toHaveText('Keys: Space or Enter rolls · R repeat bets · U undo');
  await firstBet(page); // Pass 5
  if (await page.getByTestId('craps-notice-close').isVisible()) await page.getByTestId('craps-notice-close').click();
  const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await blur();
  await page.keyboard.press('u');
  await expect(onTable(page)).toHaveText('0');
  await betSpot(page, /^Pass Line \(1:1\)/).click(); // Pass 5 again
  await blur();

  // Space rolls a natural 7, and does not scroll the page.
  const scrolled = await page.evaluate(() => window.scrollY);
  await forceNextRoll(page, [3, 4]);
  let before = await felt(page).getAttribute('data-settled');
  await page.keyboard.press('Space');
  await expect.poll(() => felt(page).getAttribute('data-settled'), { timeout: 10_000 }).not.toBe(before);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  await expect(medalsShown(page)).toHaveText(String(WELCOME + 5));
  await expect(onTable(page)).toHaveText('0');

  // R puts the Pass Line back; Enter rolls craps 2.
  await page.keyboard.press('r');
  await expect(onTable(page)).toHaveText('5');
  await forceNextRoll(page, [1, 1]);
  before = await felt(page).getAttribute('data-settled');
  await page.keyboard.press('Enter');
  await expect.poll(() => felt(page).getAttribute('data-settled'), { timeout: 10_000 }).not.toBe(before);
  await expect(medalsShown(page)).toHaveText(String(WELCOME));
  expect((await storedTable(page))?.stats.rolls).toBe(2);

  // On the odds tab the keys are the page's again.
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await blur();
  await page.keyboard.press('r');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: 'Play' }).click();
  await expect(onTable(page)).toHaveText('0');
  expect((await storedTable(page))?.stats.rolls).toBe(2);
});

test('Quick roll skips the throw, and a reduced-motion player sees the dice appear where they rest', async ({ page }) => {
  await openCraps(page);
  await firstBet(page);
  await page.getByTestId('craps-quick').click();
  await expect(page.getByTestId('craps-quick')).toHaveAttribute('aria-pressed', 'true');
  await forceNextRoll(page, [2, 2]);
  const started = Date.now();
  expect(await rollAndSettle(page)).toEqual([2, 2]);
  expect(Date.now() - started).toBeLessThan(1_000);
  // The choice is kept on this device.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('craps-counter')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('craps-quick')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('craps-quick').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await forceNextRoll(page, [6, 6]);
  const calm = Date.now();
  expect(await rollAndSettle(page)).toEqual([6, 6]);
  expect(Date.now() - calm).toBeLessThan(1_500);
});

test('a half table on a phone and the full table on a desk, with no sideways scroll, in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openCraps(page);
  await expect(shownTable(page)).toHaveAttribute('data-table-kind', 'half');
  await expect(shownTable(page)).toHaveCount(1);
  // Every bet the game takes is on the half table or the stickman's box under it, big enough to tap.
  for (const id of ['pass', 'dontPass', 'passOdds', 'dontPassOdds', 'field', 'place4', 'place10', 'any7', 'hard8', 'anyCraps']) {
    const box = (await shownTable(page).locator(`[data-bet="${id}"]`).boundingBox())!;
    expect(box.width, id).toBeGreaterThanOrEqual(24);
    expect(box.height, id).toBeGreaterThanOrEqual(24);
  }
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  await openCraps(page, 'ja');
  await expect(shownTable(page)).toContainText('パスライン');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(shownTable(page)).toHaveAttribute('data-table-kind', 'full');
  await expect(shownTable(page).getByTestId('craps-other-end')).toBeAttached();
});

test('Come and Don’t Come: bet once a point is on, move to their number, take odds there, and pay there', async ({ page }) => {
  test.setTimeout(60_000);
  await openCraps(page);
  await firstBet(page); // Pass 5
  // On the come-out roll there is no Come: it would be the Pass Line.
  await betSpot(page, /^Come \(1:1\)/).click();
  await expect(page.getByTestId('craps-message')).toContainText('once a point is on');
  await forceNextRoll(page, [2, 4]);
  await rollAndSettle(page); // the point is 6
  await betSpot(page, /^Come \(1:1\)/).click(); // Come 5
  await betSpot(page, /^Don't Come \(1:1/).click(); // Don't Come 5
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 15));

  // A 9 moves both to the 9, as a dealer moves them: no medals move.
  await forceNextRoll(page, [4, 5]);
  await rollAndSettle(page);
  await expect(page.getByTestId('craps-come-move')).toHaveText(['Come goes to the 9', "Don't Come goes to the 9"]);
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 15));
  const come9 = shownTable(page).locator('[data-come-point="come9"]');
  await expect(come9).toHaveAccessibleName('Come 9: 5 medals. Press to add Odds on Come 9 (3:2), in 2s');
  await expect(shownTable(page).locator('[data-come-point="dontCome9"]')).toBeVisible();
  expect((await storedTable(page))?.bets).toEqual({ pass: 5, come9: 5, dontCome9: 5 });

  // A press on the Come 9 puts odds behind it: BET 5 rounded up to the 2s that 3:2 pays whole medals in.
  await come9.click();
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 21));
  await expect(come9.locator('[data-odds]')).toHaveText('+6');

  // The 9 again: the Come 9 wins 5 and its odds 9; the Don't Come 9 loses; the Pass rides on.
  await forceNextRoll(page, [5, 4]);
  await rollAndSettle(page);
  await expect(medalsShown(page)).toHaveText(String(WELCOME - 21 + 5 + 5 + 6 + 9));
  expect((await storedTable(page))?.bets).toEqual({ pass: 5 });
  await expect(shownTable(page).locator('[data-come-point]')).toHaveCount(0);
});

test('on a phone a come point is big enough to tap, inside its number’s box', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openCraps(page);
  await firstBet(page);
  await forceNextRoll(page, [2, 4]);
  await rollAndSettle(page);
  await betSpot(page, /^Come \(1:1\)/).click();
  await forceNextRoll(page, [4, 5]);
  await rollAndSettle(page);
  const point = await shownTable(page).locator('[data-come-point="come9"]').boundingBox();
  const box = await shownTable(page).locator('button[data-bet="place9"]').boundingBox();
  expect(point && box).toBeTruthy();
  expect(point!.width).toBeGreaterThanOrEqual(24);
  expect(point!.height).toBeGreaterThanOrEqual(24);
  expect(point!.x).toBeGreaterThanOrEqual(box!.x - 0.5);
  expect(point!.y + point!.height).toBeLessThanOrEqual(box!.y + box!.height + 0.5);
  expect(await sideways(page)).toBeLessThanOrEqual(375);
});
