import { test, expect, type Page } from '@playwright/test';

import { TABLE_KEY, coupKey, medalsBack, serializeCoup } from '../../src/components/game/Baccarat/medals';
import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { WELCOME, rowOf, serializeLedger, take } from '../../src/components/game/MedalCenter/ledger';
import { betStep, dealAndSettle, dealButton, firstBet, handOnTable, medalsShown, onTable, openBaccarat, spot } from './baccaratPage';
import { bankBalance, bankWritten, openCenter, resetAtCenter, storedBank } from './medalCenterPage';
import { onPageError } from './pageErrors';
import { arrived } from './streamedPage';
import { quietFloor } from './quietFloor';

// The floor's API answers at once (quietFloor.ts): its 6 s waits on CI hold up navigation from the hub to a machine.
test.beforeEach(async ({ context }) => quietFloor(context));

// Baccarat on the medal floor: it plays with the player's medals from the Medal Game Center. These check the medals
// (a bet takes them at the deal, a win puts them back, once), the card that one tab at a time holds, the reset, a
// reload in the middle of a hand, and saved state from before. The table's own rules are in baccarat.spec.ts.

// The Medal Game Center's own words, which every game that plays with the medals shows.
const NOT_MONEY_EN = NOT_MONEY.en;
const NOT_MONEY_JA = NOT_MONEY.ja;

/** Where the table writes down a coup dealt from this browser's guest medals: under the medals' own device name. */
const coupKeyFor = async (page: Page): Promise<string> => coupKey((await storedBank(page))!.device);
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);
const shownAtCenter = async (page: Page) => Number(((await page.getByTestId('center-balance').textContent()) ?? '').replace(/,/g, ''));

test('plays with the medals from the Medal Game Center: a bet takes them at the deal, a win puts them back, and the hub agrees after a reload', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));

  // The floor has the table open, with a way in.
  await openCenter(page);
  await expect(page.getByTestId('center-play-baccarat')).toHaveAttribute('href', '/games/baccarat');
  await expect(page.getByTestId('center-soon').locator('[data-machine="baccarat"]')).toHaveCount(0);
  expect(await shownAtCenter(page)).toBe(WELCOME);

  await openBaccarat(page);
  expect(await medalsShown(page)).toBe(WELCOME);
  await expect(page.getByTestId('baccarat-not-money')).toHaveText(NOT_MONEY_EN);
  await expect(page.getByTestId('baccarat-center-note-link')).toHaveAttribute('href', '/games/medal-center');
  // Told once that the table plays with the player's medals now.
  await expect(page.getByTestId('baccarat-notice')).toBeVisible();
  await expect(page.getByTestId('baccarat-notice').getByRole('link', { name: 'Medal Game Center' })).toHaveAttribute('href', '/games/medal-center');
  expect(await sideways(page)).toBeLessThanOrEqual(375);

  // Ten medals on Player, hand after hand, until one wins: each hand takes its ten at the deal and gives back what it won.
  await betStep(page, 10);
  await firstBet(page, /^Player \(1:1\)/);
  expect(await medalsShown(page)).toBe(WELCOME - 10);
  expect(await bankBalance(page)).toBe(WELCOME);
  let expected = WELCOME;
  let wins = 0;
  for (let hand = 0; hand < 20 && wins === 0; hand++) {
    if (hand > 0) await page.getByRole('button', { name: 'Rebet' }).click();
    expect(await onTable(page)).toBe(10);
    await dealAndSettle(page);
    const { returned } = medalsBack({ player: 10 }, await handOnTable(page), 'ez');
    expected += returned - 10;
    if (returned > 10) wins += 1;
    await expect.poll(() => bankBalance(page)).toBe(expected);
    expect(await medalsShown(page)).toBe(expected);
  }
  expect(wins, 'one Player bet in twenty hands won').toBe(1);
  await expect(page.getByTestId('baccarat-won')).toHaveAttribute('data-medals', '20');

  // After a reload the table shows the same medals, and is not told again.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => medalsShown(page)).toBe(expected);
  await expect(page.getByTestId('baccarat-notice')).toHaveCount(0);
  // And so does the Medal Game Center, before and after a reload of its own.
  await openCenter(page);
  await expect.poll(() => shownAtCenter(page)).toBe(expected);
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('center-counter')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => shownAtCenter(page)).toBe(expected);
  expect(errors).toEqual([]);
});

test('the Play link on the floor walks straight to the table, which plays with the same medals', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCenter(page);
  await page.getByTestId('center-play-baccarat').click();
  await expect(page).toHaveURL(/\/games\/baccarat$/);
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => medalsShown(page)).toBe(WELCOME);
  await firstBet(page, /^Banker \(1:1/);
  await dealAndSettle(page);
  const { returned } = medalsBack({ banker: 1 }, await handOnTable(page), 'ez');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + returned);
  // And back: the front shows what the table left.
  await page.getByTestId('baccarat-center').click();
  await expect(page).toHaveURL(/\/games\/medal-center$/);
  await arrived(page);
  await expect(page.getByTestId('center-counter')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => shownAtCenter(page)).toBe(WELCOME - 1 + returned);
});

test('says in Japanese that medals are not money, near the counter and in the help, at a phone’s width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openBaccarat(page, 'ja');
  await expect(page.getByTestId('baccarat-not-money')).toHaveText(NOT_MONEY_JA);
  await expect(page.getByTestId('baccarat-notice')).toContainText('バカラは持ちメダルで遊ぶようになりました');
  await expect(page.getByTestId('baccarat-counter')).toContainText('持ちメダル');
  await page.getByRole('button', { name: '遊び方' }).click();
  await expect(page.getByTestId('baccarat-help-not-money')).toHaveText(NOT_MONEY_JA);
  await page.keyboard.press('Escape');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
});

test('a hand dealt just before a reload is finished, not refunded, and its medals come back once', async ({ page }) => {
  test.setTimeout(60_000);
  await openBaccarat(page);
  await betStep(page, 10);
  await firstBet(page, /^Player \(1:1\)/);
  await dealButton(page).click();
  await expect(page.getByRole('button', { name: 'Dealing…' })).toBeVisible();
  // The cards are still being turned over: the page goes, and paid the hand as it went.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  // The hand is on the table, finished, with every card turned over.
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1);
  const { returned } = medalsBack({ player: 10 }, await handOnTable(page), 'ez');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 10 + returned);
  await expect.poll(() => medalsShown(page)).toBe(WELCOME - 10 + returned);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), await coupKeyFor(page))).toBeNull();
  // Once: nothing more comes back however long the table stands, or however often it is opened.
  await page.waitForTimeout(2_000);
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME - 10 + returned);
});

test('a hand left unpaid by a page that was killed mid-deal is paid by the next one, once', async ({ page }) => {
  await openCenter(page);
  await bankWritten(page);
  // As a page killed mid-deal leaves it: the stake taken from the medals, and the hand written down unpaid.
  const ledger = (await storedBank(page))!;
  const after = take(ledger, 10)!;
  const coup = { id: 'killed-1', owner: null, device: ledger.device, era: ledger.era, stake: 10, returned: 30, spentBefore: rowOf(ledger, ledger.device).spent, state: 'dealt' as const };
  await page.evaluate(
    ([bankKey, bank, key, text]) => {
      window.localStorage.setItem(bankKey, bank);
      window.localStorage.setItem(key, text);
    },
    [BANK_KEY, serializeLedger(after), coupKey(ledger.device), serializeCoup(coup)],
  );
  await openBaccarat(page);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME + 20);
  await expect(page.getByTestId('baccarat-message')).toHaveText('The hand dealt before this page closed has been finished: 30 medals came back.');
  expect(await page.evaluate((key) => window.localStorage.getItem(key), coupKey(ledger.device))).toBeNull();
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME + 20);
  expect(await medalsShown(page)).toBe(WELCOME + 20);
});

test('another tab that takes the medals stops this table taking bets, and Play here brings them back', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await firstBet(page, /^Player \(1:1\)/);
  const other = await context.newPage();
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(other);
  // The first table waits, says why, and takes no bets.
  await expect(page.getByTestId('baccarat-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('baccarat-play-here')).toHaveText('Play here');
  await expect(spot(page, /^Player \(1:1\)/)).toBeDisabled();
  await expect(dealButton(page)).toBeDisabled();
  // The second plays from the same medals.
  await firstBet(other, /^Banker \(1:1/);
  await dealAndSettle(other);
  const { returned } = medalsBack({ banker: 1 }, await handOnTable(other), 'ez');
  await expect.poll(() => bankBalance(other)).toBe(WELCOME - 1 + returned);
  // Back to the first: it has the medals again, and the second waits.
  await page.bringToFront();
  await page.getByTestId('baccarat-play-here').click();
  await expect(page.getByTestId('baccarat-card-away')).toHaveCount(0);
  await expect(other.getByTestId('baccarat-card-away')).toBeVisible({ timeout: 10_000 });
  // It carries on with the table the other tab played: its hand is on the scoreboard.
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1);
  await firstBet(page, /^Player \(1:1\)/);
  await dealAndSettle(page);
  const second = medalsBack({ player: 1 }, await handOnTable(page), 'ez').returned;
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + returned - 1 + second);
});

test('starts over after the reset at the Medal Game Center: the medals are a new member’s, and the shoe is new', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await betStep(page, 20);
  await firstBet(page, /^Player \(1:1\)/);
  await dealAndSettle(page);
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1);
  await resetAtCenter(page);
  await openBaccarat(page);
  await expect.poll(() => medalsShown(page)).toBe(WELCOME);
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(0);
  await expect(page.getByTestId('shoe-info')).toHaveText('New shoeEight decks, shuffled on the first deal');
  await expect(page.getByTestId('baccarat-message')).toHaveText('Your medals were reset at the Medal Game Center, so this table starts over with a new shoe.');
  // Written down as started over on this device, once.
  await expect.poll(async () => {
    const ledger = await storedBank(page);
    return ledger ? (ledger.restarted[`baccarat@${ledger.device}`] ?? -1) : -1;
  }).toBe(1);
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('baccarat-message')).toHaveText('');
});

test('opens with old or damaged saved state without an error, and pays nothing from it', async ({ page }) => {
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  // The player's medals, then damaged saved state of the table's beside them.
  await openCenter(page);
  await bankWritten(page);
  await page.evaluate(
    ([tableKey, coup]) => {
      window.localStorage.setItem(tableKey, '{"v":1,"mode":"ez","shoe":{"decks":8,"cards":"A♠');
      window.localStorage.setItem(coup, '{"v":1,"id":"x","owner":null,"era":0,"stake":"ten","returned":1000}');
      // What an older version might have left: chips of the table's own, which are not medals.
      window.localStorage.setItem('baccarat-bankroll', '1000');
    },
    [TABLE_KEY, await coupKeyFor(page)],
  );
  await openBaccarat(page);
  await page.waitForTimeout(1_000);
  expect(await medalsShown(page)).toBe(WELCOME);
  expect(await bankBalance(page)).toBe(WELCOME);
  await expect(page.getByTestId('shoe-info')).toHaveText('New shoeEight decks, shuffled on the first deal');
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
