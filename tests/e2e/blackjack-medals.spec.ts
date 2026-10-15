import { test, expect, type Page } from '@playwright/test';

import { GAME, NOTICE_KEY, TABLE_KEY } from '../../src/components/game/Blackjack/medalTable';
import { PUSHER } from '../../src/components/game/MedalCenter/bank';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { arrived } from './streamedPage';
import { cardsIn, dealButton, finishRound, medalsShown, openBlackjack, seated, shownNet } from './blackjackPage';
import { bankBalance, openCenter, resetAtCenter, storedBank } from './medalCenterPage';

// Blackjack on the medal center's floor: it plays with the player's medals (MedalCenter/bank.ts), which every game
// there shares. These check the medals: a bet taken as it is made, a win put back, a hand that survives a reload, the
// card in another tab, the medal center's reset, and old saved state.

/** The medals on the medal center's counter. */
async function shownAtCenter(page: Page): Promise<number> {
  return Number(((await page.getByTestId('center-balance').textContent()) ?? '').replace(/,/g, ''));
}

/** Deals until a hand stays on the table for the player to play (no natural, no insurance asked), and returns the medals before that deal. */
async function dealAHandToPlay(page: Page): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const before = await medalsShown(page);
    await expect(dealButton(page)).toBeEnabled();
    await dealButton(page).click();
    await expect(async () => {
      const acting = (await page.locator('button[data-action="stand"]:enabled').count()) > 0;
      const insurance = await page.getByTestId('bj-insurance').isVisible();
      expect(acting || insurance || (await dealButton(page).isEnabled())).toBe(true);
    }).toPass({ timeout: 10_000 });
    if ((await page.locator('button[data-action="stand"]:enabled').count()) > 0) return before;
    await finishRound(page);
  }
  throw new Error('no hand to play in 20 deals');
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

/**
 * The player goes to another tab, or back: this one is hidden, or shown, as a browser hides a tab that is not in
 * front. (Every page Playwright opens is shown at once, as two windows side by side would be.)
 */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (isHidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('a bet comes out of the player’s medals as it is made, a win goes back in, and the medal center shows the same count after a reload', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  // A new member's medals, the same on the table's counter and in the medal center's keeping.
  expect(await medalsShown(page)).toBe(WELCOME);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME);

  // The bet is taken as the hand is dealt (a natural, or insurance asked, is played out and another hand dealt).
  const before = await dealAHandToPlay(page);
  await expect.poll(() => medalsShown(page)).toBe(before - 2);
  expect(await bankBalance(page)).toBe(before - 2);
  await expect(page.getByTestId('bj-on-table')).toHaveText('2');
  await finishRound(page);
  let medals = before + (await shownNet(page));
  await expect.poll(() => medalsShown(page)).toBe(medals);

  // Played on until a hand is won: what it wins goes back in.
  let won = false;
  for (let hand = 0; hand < 40 && !won; hand++) {
    const start = await medalsShown(page);
    await dealButton(page).click();
    await finishRound(page);
    const net = await shownNet(page);
    await expect.poll(() => medalsShown(page)).toBe(start + net);
    if (net > 0) {
      won = true;
      await expect(page.getByTestId('bj-won')).toHaveText(String(net));
    }
  }
  expect(won).toBe(true);
  medals = await medalsShown(page);
  expect(await bankBalance(page)).toBe(medals);

  // After a reload the table shows the same medals, and so does the medal center.
  await page.reload();
  await arrived(page);
  await seated(page);
  expect(await medalsShown(page)).toBe(medals);
  await openCenter(page);
  await expect.poll(() => shownAtCenter(page)).toBe(medals);
  // The table is on the floor, open, with a way in.
  await expect(page.getByTestId('center-play-blackjack')).toHaveAttribute('href', '/games/blackjack');
  await expect(page.locator('[data-machine="blackjack"]')).toHaveAttribute('data-open', 'true');
});

test('a hand in the middle survives a reload: the same cards, its stake taken once, and it plays on', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  const before = await dealAHandToPlay(page);
  const dealer = await cardsIn(page, '[data-area="dealer"]');
  const player = await cardsIn(page, '[data-area="player"]');
  await expect.poll(() => medalsShown(page)).toBe(before - 2);

  await page.reload();
  await arrived(page);
  await seated(page);
  // The same hand, the hole card still down, the stake still on it and not taken again.
  await expect(page.getByTestId('bj-message')).toHaveText('The hand you were playing is back on the table.');
  expect(await cardsIn(page, '[data-area="dealer"]')).toEqual(dealer);
  expect(await cardsIn(page, '[data-area="player"]')).toEqual(player);
  await expect(page.locator('[data-hole="true"]')).toHaveCount(1);
  expect(await medalsShown(page)).toBe(before - 2);
  expect(await bankBalance(page)).toBe(before - 2);
  await expect(page.getByTestId('bj-on-table')).toHaveText('2');

  await finishRound(page);
  const net = await shownNet(page);
  await expect.poll(() => medalsShown(page)).toBe(before + net);
  expect(await bankBalance(page)).toBe(before + net);
  // And settled once: another reload changes nothing.
  await page.reload();
  await arrived(page);
  await seated(page);
  expect(await medalsShown(page)).toBe(before + net);
});

test('the medals in another tab: this table stops taking bets and waits, and Play here brings them back', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openBlackjack(page);
  const other = await context.newPage();
  await openBlackjack(other);
  // The first tab waits, says why, and takes no bet.
  await expect(page.getByTestId('bj-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('bj-play-here')).toHaveText('Play here');
  await expect(dealButton(page)).toBeDisabled();
  await expect(page.getByTestId('bj-max-bet')).toBeDisabled();
  // The second plays with the same medals.
  expect(await medalsShown(other)).toBe(await medalsShown(page));
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await dealButton(other).click();
  await finishRound(other);
  const after = await bankBalance(other);
  // Back to the first: it has the card again, the medals the second left, and the second waits.
  await page.bringToFront();
  await page.getByTestId('bj-play-here').click();
  await expect(page.getByTestId('bj-card-away')).toHaveCount(0);
  await expect(other.getByTestId('bj-card-away')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => medalsShown(page)).toBe(after);
  await expect(dealButton(page)).toBeEnabled();
});

test('the medal center’s reset starts the table over: the hand on it goes with the medals', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  await dealAHandToPlay(page);
  await expect(page.locator('[data-hand]')).toHaveCount(1);
  // The player goes to the medal center in another tab, the table's tab hidden behind it with the hand on it, and
  // resets the medals there. (With both tabs shown at once, the medal center's moment with the card can wait for
  // good when its request for the card reaches the browser late: a race in MedalCenter/bank.ts, reported on the PR.)
  const hub = await context.newPage();
  await setHidden(page, true);
  await resetAtCenter(hub);
  // The hidden table hears of the reset and starts over on the page at once.
  await expect(page.locator('[data-hand]')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId('bj-announcement')).toContainText('The Medal Game Center was reset');
  await expect.poll(() => medalsShown(page)).toBe(WELCOME);
  // Back to the table's tab: it has the card again, and writes itself down as started over.
  await page.bringToFront();
  await setHidden(page, false);
  await seated(page);
  await expect(page.getByTestId('shoe-info')).toHaveText('A fresh six-deck shoe is shuffled on the first deal.');
  // This device's table is written down as started over in the new era, once.
  await expect
    .poll(async () => {
      const ledger = await storedBank(page);
      return ledger ? (ledger.restarted[`${GAME}@${ledger.device}`] ?? -1) : -1;
    })
    .toBe(1);
  // And it plays on, with the new medals.
  await dealButton(page).click();
  await finishRound(page);
  await expect.poll(() => medalsShown(page)).toBe(WELCOME + (await shownNet(page)));
  // Kept as played: after a reload the hand is still on the table (as many hands as it was split into).
  const hands = await page.locator('[data-hand]').count();
  expect(hands).toBeGreaterThan(0);
  await page.reload();
  await arrived(page);
  await seated(page);
  await expect(page.locator('[data-hand]')).toHaveCount(hands);
});

test('old saved state: what the table cannot read is put aside, and the medals a Medal Pusher kept before the medal center are played here', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ([tableKey, machineKey]) => {
      if (window.localStorage.getItem(machineKey) !== null) return;
      // The chips the table had before were never kept; this is what a table it cannot read looks like.
      window.localStorage.setItem(tableKey, '{"bankroll":1000,"bet":10}');
      window.localStorage.setItem(machineKey, JSON.stringify({ version: 9, session: { credits: 1234 } }));
    },
    [TABLE_KEY, PUSHER.machineKey],
  );
  await openBlackjack(page);
  await expect(page.getByTestId('bj-medals')).toHaveText('1,234');
  await dealButton(page).click();
  await expect.poll(() => bankBalance(page)).toBeLessThan(1234);
  expect(await page.evaluate((key) => window.localStorage.getItem(`${key}#unread`), TABLE_KEY)).toBe('{"bankroll":1000,"bet":10}');
  expect(errors).toEqual([]);
});

test('a browser with no room left for the table bets nothing, and says why', async ({ page }) => {
  // As a browser whose storage for the site is full would: the table cannot be written down while `__full` is set.
  await page.addInitScript((tableKey) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === tableKey && (window as unknown as { __full?: boolean }).__full) throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  }, TABLE_KEY);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  const before = await medalsShown(page);
  await page.evaluate(() => {
    (window as unknown as { __full?: boolean }).__full = true;
  });
  await dealButton(page).click();
  await expect(page.getByTestId('bj-message')).toHaveText('This browser could not save the table, so no medals were bet. Its storage for this site may be full.');
  await expect(page.locator('[data-hand]')).toHaveCount(0);
  await expect.poll(() => medalsShown(page)).toBe(before);
  await expect.poll(() => bankBalance(page)).toBe(before);
  // With room again, the same bet is made, and only that one: the refused deal took nothing.
  await page.evaluate(() => {
    (window as unknown as { __full?: boolean }).__full = false;
  });
  await dealButton(page).click();
  await expect.poll(() => bankBalance(page)).toBe(before - 2);
});

test('at a phone’s width, in both languages: the counter, the note that medals are not money, the note shown once, and no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openBlackjack(page);
  await expect(page.getByTestId('bj-notice')).toBeVisible();
  await expect(page.getByTestId('bj-notice-center')).toHaveAttribute('href', '/games/medal-center');
  await expect(page.getByTestId('bj-not-money')).toHaveText(
    'Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.',
  );
  await expect(page.getByTestId('bj-center')).toHaveAttribute('href', '/games/medal-center');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), NOTICE_KEY)).toBe('seen');

  // Shown once: not again.
  await openBlackjack(page, 'ja');
  await expect(page.getByTestId('bj-notice')).toHaveCount(0);
  await expect(page.locator('#bj-medals-label')).toHaveText('持ちメダル');
  await expect(page.getByTestId('bj-not-money')).toHaveText('メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。');
  await dealButton(page).click();
  await expect.poll(() => medalsShown(page)).toBeLessThan(WELCOME);
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});
