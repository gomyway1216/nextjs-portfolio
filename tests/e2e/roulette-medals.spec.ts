import { test, expect, type Page } from '@playwright/test';

import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { colorOf } from '../../src/components/game/Roulette/engine';
import { getStrings } from '../../src/components/game/Roulette/i18n';
import { ROULETTE_RESULTS_STORAGE_KEY } from '../../src/components/game/Roulette/resultsStore';
import { NOTICE_KEY, ROULETTE_GAME, SPIN_KEY, parseSpin, winningsOf, type SpinRecord } from '../../src/components/game/Roulette/medalTable';
import { bankBalance, openCenter, resetAtCenter, storedBank } from './medalCenterPage';
import { boardNumbers, openRoulette, placeFirstBet, settledResult, shownBet, shownMedals, spinButton } from './roulettePage';
import { arrived } from './streamedPage';

// Roulette on the medal center's floor: it plays with the player's medals, the ones every game there shares. A bet
// is taken when the wheel spins and what it wins goes back when the ball stops, once each, through reloads, a page
// that dies, another tab and the medal center's reset. Nothing here signs in: the medals are a guest's, on this device.


/** The spin this device has on record for a guest, read the way the table reads it. */
async function spinOnRecord(page: Page): Promise<SpinRecord | null> {
  return parseSpin(await page.evaluate((key) => window.localStorage.getItem(key), SPIN_KEY));
}

/** One medal on red, one on black and one on zero: whatever comes up, something wins. */
async function coverTheWheel(page: Page) {
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: /^Black \(1:1\)$/ }).click();
  await page.getByRole('button', { name: /^Straight up \(35:1\) — 0$/ }).click();
  await expect.poll(() => shownBet(page)).toBe(3);
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

/** Stops the pages' clock (installed with `page.clock.install`) a moment from now: time moves on while the page is asked, so a moment that has gone by is asked again. */
async function stopClock(page: Page): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 300);
      return;
    } catch (error) {
      if (attempt >= 4 || !String(error).includes('past')) throw error;
    }
  }
}

test('a bet takes medals when the wheel spins, a win puts medals back, and the medal center shows the same count after a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page);
  expect(await shownMedals(page)).toBe(WELCOME);
  await expect(page.getByTestId('roulette-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('roulette-center')).toHaveAttribute('href', '/games/medal-center');

  await coverTheWheel(page);
  // On the felt, off the counter, and not yet taken from the medals.
  expect(await shownMedals(page)).toBe(WELCOME - 3);
  expect(await bankBalance(page)).toBe(WELCOME);

  await spinButton(page).click();
  const n = await settledResult(page);
  const won = n === 0 ? 36 : 2;
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 3 + won);
  expect(await shownMedals(page)).toBe(WELCOME - 3 + won);
  await expect(page.getByTestId('roulette-outcome')).toHaveAttribute('data-won', String(won));
  await expect(page.getByTestId('roulette-outcome')).toContainText(getStrings('en').wonLine(won, won - 3));
  expect(await spinOnRecord(page)).toMatchObject({ result: n, wagered: 3, won, paid: true });
  await expect(page.getByTestId('roulette-announcement')).toContainText(`Won ${won} medals`);

  // After a reload the table shows the same medals, and so does the medal center.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-medals', String(WELCOME - 3 + won));
  // The last spin is still shown, as the last one.
  await expect(page.getByTestId('roulette-outcome')).toContainText(`Last spin: Won ${won} medals`);
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME - 3 + won));
  // And the floor has the table open, with a way in.
  await expect(page.getByTestId('center-play-roulette')).toHaveAttribute('href', '/games/roulette');
  await expect(page.locator('[data-machine="roulette"]')).toHaveAttribute('data-open', 'true');
});

/** The next spin comes up `n`. */
const comeUp = (page: Page, n: number) =>
  page.evaluate((pocket) => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => {
      Math.random = w.__random;
      return (pocket + 0.5) / 37;
    };
  }, n);

test('Rebet puts the last spin’s bets back on the felt, after a reload too, and only when the medals cover them', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page);
  const rebet = page.getByTestId('roulette-rebet');
  // Nothing to repeat before the first spin.
  await expect(rebet).toBeDisabled();
  await expect(rebet).toHaveText('Rebet');

  // Five on red (one tap at five a tap), one on 17.
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: /^Undo$/ }).click();
  await page.getByRole('radio', { name: 'Bet 5 medals a tap' }).click();
  await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
  await page.getByRole('radio', { name: 'Bet 1 medal a tap' }).click();
  await page.getByRole('button', { name: /^Straight up \(35:1\) — 17$/ }).click();
  await expect.poll(() => shownBet(page)).toBe(6);
  await expect(rebet).toBeDisabled();
  await comeUp(page, 2);
  await spinButton(page).click();
  expect(await settledResult(page)).toBe(2);
  // 2 is black: both bets lost, and the felt is clear.
  expect(await shownMedals(page)).toBe(WELCOME - 6);
  expect(await shownBet(page)).toBe(0);

  // Rebet: the same two bets, at once.
  await expect(rebet).toBeEnabled();
  await expect(rebet).toHaveText('Rebet 6');
  await rebet.click();
  await expect.poll(() => shownBet(page)).toBe(6);
  expect(await shownMedals(page)).toBe(WELCOME - 12);
  await expect(page.getByRole('button', { name: /^Red \(1:1\)$/ })).toHaveText('RED5');
  await expect(page.getByRole('button', { name: /^Straight up \(35:1\) — 17$/ })).toHaveText('171');
  await expect(rebet).toBeDisabled();
  // Undo takes them off again, the last one first.
  await page.getByRole('button', { name: /^Undo$/ }).click();
  await expect.poll(() => shownBet(page)).toBe(5);
  await page.getByRole('button', { name: /^Undo$/ }).click();
  await expect.poll(() => shownBet(page)).toBe(0);

  // After a reload, the last spin's bets are still there to repeat.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-loaded', 'true');
  await expect(rebet).toHaveText('Rebet 6');
  await rebet.click();
  await expect.poll(() => shownBet(page)).toBe(6);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();

  // Everything on red twice over, lost: Rebet then asks for more medals than there are, and puts nothing down.
  await page.getByRole('radio', { name: 'Bet 50 medals a tap' }).click();
  await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
  await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
  await expect.poll(() => shownBet(page)).toBe(WELCOME - 6);
  await comeUp(page, 2);
  await spinButton(page).click();
  expect(await settledResult(page)).toBe(2);
  expect(await shownMedals(page)).toBe(0);
  await expect(rebet).toHaveText(`Rebet ${WELCOME - 6}`);
  await rebet.click();
  await expect(page.getByTestId('roulette-message')).toHaveText(`Not enough medals to repeat the last bets (${WELCOME - 6} medals).`);
  expect(await shownBet(page)).toBe(0);
  expect(await bankBalance(page)).toBe(0);
});

test('a reload while the ball is rolling settles the spin once, with the number drawn when it was bet', async ({ page }) => {
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: /^Black \(1:1\)$/ }).click();
  await spinButton(page).click();
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'true');
  // Taken as the wheel spins, and on record with its number before the ball has stopped.
  expect(await bankBalance(page)).toBe(WELCOME - 2);
  const staked = await spinOnRecord(page);
  expect(staked).toMatchObject({ wagered: 2, paid: false });

  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-loaded', 'true');
  // Settled as the page was left: not refunded, and paid once.
  const after = await spinOnRecord(page);
  expect(after).toMatchObject({ id: staked!.id, result: staked!.result, paid: true });
  const won = winningsOf(after!.bets, after!.result);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2 + won);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-medals', String(WELCOME - 2 + won));
  await expect(page.getByTestId('roulette-outcome')).toHaveAttribute('data-won', String(won));
  await expect.poll(() => boardNumbers(page)).toEqual([staked!.result]);

  // Another reload pays nothing more and posts nothing more.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-loaded', 'true');
  await page.waitForTimeout(500);
  expect(await bankBalance(page)).toBe(WELCOME - 2 + won);
  expect(await boardNumbers(page)).toEqual([staked!.result]);
});

test('moving to another page of the site while the ball rolls settles the spin as the table is taken down', async ({ page }) => {
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: /^Black \(1:1\)$/ }).click();
  await spinButton(page).click();
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'true');
  const staked = await spinOnRecord(page);
  expect(staked).toMatchObject({ wagered: 2, paid: false });
  // The site's own link to the games: the page is not left, the table is unmounted (a mark on the window survives).
  await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true));
  await page.getByRole('link', { name: 'Games', exact: true }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/games$/);
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);
  await expect.poll(async () => (await spinOnRecord(page))?.paid).toBe(true);
  expect(await bankBalance(page)).toBe(WELCOME - 2 + winningsOf(staked!.bets, staked!.result));
});

test('a spin settled while the medal center borrowed the medals still goes on the board when the page is reloaded before the ball stops', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await spinButton(page).click();
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'true');
  const staked = await spinOnRecord(page);
  // The day's bonus taken at the medal center in another tab: it borrows the medals for a moment, and the spin is
  // settled as they go.
  const hub = await context.newPage();
  await openCenter(hub);
  await hub.getByTestId('pusher-bonus-take').click();
  await expect(hub.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  await expect.poll(async () => (await spinOnRecord(page))?.paid).toBe(true);
  await hub.close();
  // Reloaded before the ball has stopped: the number goes on the board all the same, once.
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'true');
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => boardNumbers(page)).toEqual([staked!.result]);
});

test('a win paid while the medal center borrowed the medals is not shown before the ball stops, and runs in once it has', async ({ page, context }) => {
  test.setTimeout(60_000);
  // The pages' clock is the test's: it runs as usual until it is stopped, and then the ball stays where it is while the
  // medal center borrows the medals, however long that takes.
  await page.clock.install();
  // The medal center is open in another tab first, so that the day's bonus is there to take while the ball rolls.
  const hub = await context.newPage();
  await openCenter(hub);
  await expect(hub.getByTestId('pusher-bonus-take')).toBeVisible();
  await page.bringToFront();
  await openRoulette(page);
  await coverTheWheel(page);
  // Zero comes up: the medal on it wins 36 (35 and the medal back).
  await page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => 0.5 / 37;
  });
  await spinButton(page).click();
  await page.evaluate(() => {
    Math.random = (window as unknown as { __random: () => number }).__random;
  });
  const wheel = page.locator('[data-spinning]');
  await expect(wheel).toHaveAttribute('data-spinning', 'true');
  await stopClock(page);
  // The bonus is taken at the medal center while the ball rolls: it borrows the medals for a moment, and the spin is
  // settled as they go. The 36 are the player's at once, and once only.
  await hub.getByTestId('pusher-bonus-take').click();
  await expect(hub.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  await expect.poll(async () => (await spinOnRecord(page))?.paid).toBe(true);
  const bonus = (await bankBalance(page)) - (WELCOME - 3 + 36);
  expect(bonus).toBeGreaterThan(0);
  // Still rolling: the counter has the bonus, which is no win of the table's, and not the 36, which the ball has not
  // stopped on yet.
  const led = () => page.getByTestId('roulette-medals-led').evaluate((el) => Number((el as HTMLElement).dataset.shown));
  await expect.poll(() => shownMedals(page)).toBe(WELCOME - 3 + bonus);
  await expect.poll(led).toBe(WELCOME - 3 + bonus);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-win', '0');
  await expect(wheel).toHaveAttribute('data-spinning', 'true');
  // Time goes on, and the ball stops on zero: the 36 show, and run into the medals on the counter.
  await page.clock.resume();
  expect(await settledResult(page)).toBe(0);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-win', '36');
  expect(await shownMedals(page)).toBe(WELCOME - 3 + bonus + 36);
  expect(await led()).toBeLessThan(WELCOME - 3 + bonus + 36);
  await expect.poll(led, { timeout: 4_000 }).toBe(WELCOME - 3 + bonus + 36);
  // Paid once: what the medal center borrowed the medals for put the 36 in, and the ball stopping put nothing more.
  expect(await bankBalance(page)).toBe(WELCOME - 3 + bonus + 36);
  await hub.close();
});

test('a reset at the medal center while the ball rolls: once it stops, the table shows nothing of before', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await spinButton(page).click();
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'true');
  const hub = await context.newPage();
  await openCenter(hub);
  await hub.getByTestId('center-reset').click();
  await hub.getByTestId('center-reset-confirm').click();
  await expect(hub.getByTestId('center-balance')).toHaveText(String(WELCOME));
  await page.bringToFront();
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'false', { timeout: 15_000 });
  await expect(page.getByTestId('roulette-result')).toHaveText('');
  await expect(page.getByTestId('roulette-outcome')).toHaveAttribute('data-won', '');
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-medals', String(WELCOME));
  await expect(page.getByText('No spins yet.')).toBeVisible();
});

test('a page that dies mid-spin: the next one spins the wheel again to the same number and pays it once', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: /^Black \(1:1\)$/ }).click();
  await spinButton(page).click();
  await expect(page.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'true');
  const staked = await spinOnRecord(page);
  expect(staked).toMatchObject({ wagered: 2, paid: false });
  // The tab's renderer dies: no pagehide, nothing settled.
  const cdp = await context.newCDPSession(page);
  const crashed = page.waitForEvent('crash');
  void cdp.send('Page.crash').catch(() => undefined);
  await crashed;

  const next = await context.newPage();
  await openRoulette(next);
  await expect(next.getByTestId('roulette-announcement')).toContainText('Your last spin had not finished');
  expect(await settledResult(next)).toBe(staked!.result);
  const won = winningsOf(staked!.bets, staked!.result);
  await expect.poll(() => bankBalance(next)).toBe(WELCOME - 2 + won);
  expect(await spinOnRecord(next)).toMatchObject({ id: staked!.id, paid: true });
  expect(await boardNumbers(next)).toEqual([staked!.result]);

  await next.reload();
  await arrived(next);
  await expect(next.getByTestId('roulette-meter')).toHaveAttribute('data-loaded', 'true');
  await next.waitForTimeout(500);
  expect(await bankBalance(next)).toBe(WELCOME - 2 + won);
  await expect(next.locator('[data-spinning]')).toHaveAttribute('data-spinning', 'false');
});

test('another tab takes the medals: this table stops taking bets and says so, and Play here brings them back', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);

  const other = await context.newPage();
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(other);
  await expect(page.getByTestId('roulette-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('roulette-play-here')).toHaveText('Play here');
  await expect(spinButton(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Black \(1:1\)$/ })).toBeDisabled();

  // The other tab plays the same medals.
  await placeFirstBet(other, /^Red \(1:1\)$/);
  await spinButton(other).click();
  const n = await settledResult(other);
  const medals = WELCOME + (colorOf(n) === 'red' ? 1 : -1);
  await expect.poll(() => bankBalance(other)).toBe(medals);

  // Back to the first: it has the medals again, with what the other tab left, and the other waits.
  await page.bringToFront();
  await page.getByTestId('roulette-play-here').click();
  await expect(page.getByTestId('roulette-card-away')).toHaveCount(0);
  await expect(other.getByTestId('roulette-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-medals', String(medals - 1));
  await expect(spinButton(page)).toBeEnabled();
  await spinButton(page).click();
  await settledResult(page);
  await expect.poll(async () => (await spinOnRecord(page))?.paid).toBe(true);
  const last = (await spinOnRecord(page))!;
  expect(await bankBalance(page)).toBe(medals - 1 + last.won);
});

test('the medal center’s reset starts the table over; the winning numbers, which describe the wheel, stay', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await spinButton(page).click();
  const n = await settledResult(page);
  await expect(page.getByText('No spins yet.')).toHaveCount(0);
  await expect.poll(async () => (await spinOnRecord(page))?.paid).toBe(true);

  await resetAtCenter(page);
  await openRoulette(page);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-medals', String(WELCOME));
  await expect(page.getByText('No spins yet.')).toBeVisible();
  await expect(page.getByTestId('roulette-outcome')).toHaveAttribute('data-won', '');
  expect(await boardNumbers(page)).toEqual([n]);
  // This device's table is written down as started over in the new era, and its old spin is off the record.
  await expect.poll(async () => {
    const ledger = await storedBank(page);
    return ledger ? (ledger.restarted[`${ROULETTE_GAME}@${ledger.device}`] ?? -1) : -1;
  }).toBe(1);
  await expect.poll(() => spinOnRecord(page)).toBeNull();
});

test('old saved state: the board is kept, the chips are retired, and the note that says so is shown once', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // What a player of the chip-era table has on this device: the results board (the chips were never saved), and,
  // where the table now writes its spin, text it cannot read.
  await page.addInitScript(
    ([boardKey, spinKey]) => {
      if (window.localStorage.getItem(boardKey) === null) window.localStorage.setItem(boardKey, JSON.stringify({ results: [17, 0, 32, 5], spinCount: 412 }));
      if (window.sessionStorage.getItem('seeded') === null) {
        window.sessionStorage.setItem('seeded', '1');
        window.localStorage.setItem(spinKey, '{"v":0,"bankroll":1000,"chips":[25,100]}');
      }
    },
    [ROULETTE_RESULTS_STORAGE_KEY, SPIN_KEY],
  );
  await openRoulette(page);
  await expect.poll(() => boardNumbers(page)).toEqual([17, 0, 32, 5]);
  // A new player's medals, not the old chips; and what could not be read is cleared.
  expect(await shownMedals(page)).toBe(WELCOME);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), SPIN_KEY)).toBeNull();
  const notice = page.getByTestId('roulette-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Roulette now plays with your medals from the Medal Game Center');
  await expect(notice.getByRole('link')).toHaveAttribute('href', '/games/medal-center');
  await page.getByTestId('roulette-notice-ok').click();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), NOTICE_KEY)).not.toBeNull();
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('roulette-notice')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the medal counter and the note that medals are not money, at a phone’s width, in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openRoulette(page);
  await expect(page.getByTestId('roulette-meter')).toBeVisible();
  await expect(page.getByTestId('roulette-medals')).toHaveText(`Your medals: ${WELCOME}`);
  await expect(page.getByTestId('roulette-not-money')).toHaveText(NOT_MONEY.en);
  expect(await sideways(page)).toBeLessThanOrEqual(375);

  await openRoulette(page, 'ja');
  await expect(page.getByTestId('roulette-medals')).toHaveText(`持ちメダル ${WELCOME}枚`);
  await expect(page.getByTestId('roulette-not-money')).toHaveText(NOT_MONEY.ja);
  await expect(page.getByRole('radiogroup', { name: '1回のベット枚数' })).toBeVisible();
  expect(await sideways(page)).toBeLessThanOrEqual(375);
});

test('the WIN counter shows what a spin won, and the win runs into the medals on the counter', async ({ page }) => {
  await openRoulette(page);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-win', '0');
  await coverTheWheel(page);
  // Zero comes up: the medal on it wins 36 (35 and the medal back).
  await page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => 0.5 / 37;
  });
  await spinButton(page).click();
  await page.evaluate(() => {
    Math.random = (window as unknown as { __random: () => number }).__random;
  });
  // While the ball rolls the WIN counter is at 0.
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-win', '0');
  expect(await settledResult(page)).toBe(0);
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-win', '36');
  await expect(page.getByTestId('roulette-win')).toHaveText('Won on the last spin: 36 medals');
  // The medals are the player's at once; their LEDs count up to them.
  expect(await shownMedals(page)).toBe(WELCOME - 3 + 36);
  const led = () => page.getByTestId('roulette-medals-led').evaluate((el) => Number((el as HTMLElement).dataset.shown));
  const early = await led();
  expect(early).toBeGreaterThanOrEqual(WELCOME - 3);
  expect(early).toBeLessThan(WELCOME - 3 + 36);
  await expect.poll(led, { timeout: 4_000 }).toBe(WELCOME - 3 + 36);
  // A bet put on the felt (or taken back) is on the counter at once.
  await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
  await expect.poll(led, { timeout: 500 }).toBe(WELCOME - 3 + 36 - 1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(led, { timeout: 500 }).toBe(WELCOME - 3 + 36);
});
