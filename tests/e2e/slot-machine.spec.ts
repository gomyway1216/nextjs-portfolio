import { test, expect, type Page } from '@playwright/test';

import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { PHYSICAL_STOPS, REELS, evaluateLine, type Line, type SymbolId } from '../../src/components/game/SlotMachine/engine';
import { NOTICE_KEY, ROUND_KEY, SLOT_GAME, parseRound } from '../../src/components/game/SlotMachine/medals';
import { bankBalance, openCenter, resetAtCenter, storedBank } from './medalCenterPage';
import { settled } from './medalPusherPage';
import { arrived } from './streamedPage';

// Spins are random, so these checks read what was drawn and verify that the
// reels on screen, the announced payline, the payout, the stats and the
// player's medals (the medal center's bank, in this browser's storage) all agree.

const STRIP_CELLS = PHYSICAL_STOPS + 3;
const EN_SYMBOLS: Record<string, SymbolId> = { '7': 'seven', BAR: 'bar', Bell: 'bell', Plum: 'plum', Cherry: 'cherry', Blank: 'blank' };

async function openSlots(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/slot-machine');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(reelWindow(page)).toBeVisible();
  // The medals are read, and the card is here: the machine takes bets.
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true', { timeout: 20_000 });
}

const reelWindow = (page: Page) => page.locator('[role="img"][data-spinning]');
const spinButton = (page: Page) => page.getByRole('button', { name: 'SPIN', exact: true });

/** A count of medals as the counter writes it. */
const count = (n: number) => n.toLocaleString('en-US');

/** The medals on the machine's counter. */
async function medals(page: Page): Promise<number> {
  return Number(((await page.getByTestId('slot-medals').textContent()) ?? '').replace(/,/g, ''));
}

/** Presses SPIN once the machine takes bets (its medals read, the card here, the page hydrated). */
async function spin(page: Page) {
  await expect(spinButton(page)).toBeEnabled({ timeout: 20_000 });
  await spinButton(page).click();
  await expect(reelWindow(page)).toHaveAttribute('data-spinning', 'true');
}

/** The next spins land on 7-7-7: virtual stop 0 of every reel is its 7. Put back with `unforce`. */
const force = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => 0.001;
  });
const unforce = (page: Page) =>
  page.evaluate(() => {
    Math.random = (window as unknown as { __random: () => number }).__random;
  });

async function settledLine(page: Page): Promise<Line> {
  await expect(reelWindow(page)).toHaveAttribute('data-spinning', 'false', { timeout: 10_000 });
  const label = (await reelWindow(page).getAttribute('aria-label')) ?? '';
  const names = label.replace(/^Payline: /, '').split(', ');
  expect(names, label).toHaveLength(3);
  return names.map((n) => EN_SYMBOLS[n]) as unknown as Line;
}

/** The symbol each strip is actually showing in the middle (payline) row. */
async function paylineOnScreen(page: Page): Promise<SymbolId[]> {
  const offsets = await page.locator('[data-reel]').evaluateAll((strips) =>
    strips.map((s) => Number((s as HTMLElement).style.transform.match(/(-?[\d.]+)%/)![1])),
  );
  return offsets.map((pct, r) => {
    const top = Math.round((-pct / 100) * STRIP_CELLS);
    return REELS[r][(top + 1) % PHYSICAL_STOPS].symbol;
  });
}

async function stat(page: Page, label: string): Promise<number> {
  const text = await page.locator('dl div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd').innerText();
  return Number(text.replace(/[,+]/g, '').split(' ')[0]);
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test('the reels stop on the payline that is announced, and its win goes into the player’s medals', async ({ page }) => {
  await openSlots(page);
  expect(await medals(page)).toBe(WELCOME);
  await spin(page);
  await expect(page.getByRole('button', { name: 'Spinning…' })).toBeDisabled();
  // The stake is out of the medals as the lever is pulled.
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 1));

  // The strips really move (animated, not snapped to the result).
  const early = await page.locator('[data-reel="0"]').getAttribute('style');
  await page.waitForTimeout(250);
  expect(await page.locator('[data-reel="0"]').getAttribute('style')).not.toBe(early);

  const line = await settledLine(page);
  expect(await paylineOnScreen(page)).toEqual([...line]);

  const win = (evaluateLine(line)?.pays ?? 0) * 1;
  await expect(page.getByTestId('slot-win')).toHaveText(String(win));
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 1 + win));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + win);
  expect(await stat(page, 'Spins')).toBe(1);
  expect(await stat(page, 'Medals won')).toBe(win);
});

test('switching tabs mid-spin keeps the spin and the session', async ({ page }) => {
  await openSlots(page);
  await spin(page);
  // Leave while the reels are still rolling (the bet is already taken)…
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await expect(page.getByTestId('slot-rtp')).toBeVisible();
  await page.waitForTimeout(2_500);
  // …and come back: the spin has settled and been paid, nothing was reset.
  await page.getByRole('tab', { name: 'Play' }).click();
  const line = await settledLine(page);
  const win = evaluateLine(line)?.pays ?? 0;
  expect(await stat(page, 'Spins')).toBe(1);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 1 + win));
  expect(await paylineOnScreen(page)).toEqual([...line]);
});

test('a jackpot pays 1000× the medals bet, and the session books balance over auto-spins at three medals a spin', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page);
  await spin(page);
  await settledLine(page);
  const afterFirst = await medals(page);

  // Three medals, the most the machine takes, and the draw forced to 7-7-7. Put back right after.
  await page.getByRole('radio', { name: 'BET 3 medals' }).click();
  await expect(page.getByTestId('slot-bet')).toHaveText('3');
  await force(page);
  await spinButton(page).click();
  await unforce(page);
  expect(await settledLine(page)).toEqual(['seven', 'seven', 'seven']);
  expect(await paylineOnScreen(page)).toEqual(['seven', 'seven', 'seven']);
  await expect(page.getByTestId('slot-win')).toHaveText('3000');
  await expect(page.getByTestId('slot-medals')).toHaveText(count(afterFirst - 3 + 3000));
  await expect(page.getByTestId('slot-result')).toHaveText('Three 7s — won 3000 medals!');

  await page.getByRole('button', { name: 'Auto ×10' }).click();
  await expect.poll(() => stat(page, 'Spins'), { timeout: 30_000 }).toBe(12);
  await expect(reelWindow(page)).toHaveAttribute('data-spinning', 'false');
  await expect(page.getByRole('button', { name: 'Auto ×10' })).toBeEnabled();

  const wagered = await stat(page, 'Medals bet');
  const paid = await stat(page, 'Medals won');
  expect(wagered).toBe(1 + 3 + 10 * 3);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - wagered + paid));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - wagered + paid);
  expect(await stat(page, 'Net medals')).toBe(paid - wagered);
});

test('plays with the medal center’s medals: a bet takes them, a win adds them, and the hub shows the same count after a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page);
  await expect(page.getByTestId('slot-center')).toHaveAttribute('href', '/games/medal-center');
  await expect(page.getByTestId('slot-not-money')).toHaveText(NOT_MONEY.en);
  // A losing spin of two medals: two come out, nothing goes back.
  await page.getByRole('radio', { name: 'BET 2 medals' }).click();
  await page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    // Virtual stop 63 of every reel is the blank above its 7: no win.
    Math.random = () => 0.999;
  });
  await spinButton(page).click();
  await unforce(page);
  expect(evaluateLine(await settledLine(page))).toBeNull();
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 2));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2);
  // A winning spin of two medals: two out, two thousand back.
  await force(page);
  await spinButton(page).click();
  await unforce(page);
  await settledLine(page);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 4 + 2000));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 4 + 2000);
  // The round is settled and no longer written down.
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ROUND_KEY)).toBeNull();

  // After a reload the machine shows the same medals, and so does the medal center's counter.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('slot-medals')).toHaveText('2,096');
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText('2,096');
  await expect(page.getByTestId('center-play-slot-machine')).toHaveAttribute('href', '/games/slot-machine');
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('center-balance')).toHaveText('2,096');
  expect(await bankBalance(page)).toBe(2096);
});

test('a spin under way when the page is reloaded is finished after the reload, and paid once: never refunded, never twice', async ({ page }) => {
  await openSlots(page);
  await force(page);
  await spin(page);
  await unforce(page);
  // The stake is taken and the round written down, not yet paid: its reels are still turning (7-7 holds the last one).
  const before = parseRound(await page.evaluate((key) => window.localStorage.getItem(key), ROUND_KEY));
  expect(before).toMatchObject({ bet: 1, stops: [0, 0, 0], paid: false });
  expect(await bankBalance(page)).toBe(WELCOME - 1);

  await page.reload();
  await arrived(page);
  // The page going paid it, once; the tab comes back and is shown the spin it left, reels and all.
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('slot-resumed')).toHaveText('The spin left under way has been finished.', { timeout: 15_000 });
  expect(await settledLine(page)).toEqual(['seven', 'seven', 'seven']);
  expect(await paylineOnScreen(page)).toEqual(['seven', 'seven', 'seven']);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 1 + 1000));
  await expect(page.getByTestId('slot-result')).toHaveText('Three 7s — won 1000 medals!');
  expect(await stat(page, 'Spins')).toBe(1);
  expect(await bankBalance(page)).toBe(WELCOME + 999);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), ROUND_KEY)).toBeNull();

  // Nothing more comes of it, however often the page is opened.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true', { timeout: 20_000 });
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME + 999));
  expect(await stat(page, 'Spins')).toBe(0);
  expect(await bankBalance(page)).toBe(WELCOME + 999);
});

test('the medals are played at one machine at a time: another tab takes them, this one waits, and Play here brings them back', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page);
  await spin(page);
  await settledLine(page);
  const other = await context.newPage();
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(other);
  // The first tab's machine waits, says why, and takes no bet.
  await expect(page.getByTestId('slot-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('slot-play-here')).toHaveText('Play here');
  await expect(spinButton(page)).toBeDisabled();
  // The second plays with the same medals.
  await expect.poll(() => medals(other)).toBe(await bankBalance(other));
  await spin(other);
  await settledLine(other);
  await expect.poll(() => bankBalance(other)).toBe(await medals(other));
  // Back to the first: it has the medals again, as the second left them, and the second waits.
  await page.bringToFront();
  await page.getByTestId('slot-play-here').click();
  await expect(page.getByTestId('slot-card-away')).toHaveCount(0);
  await expect(other.getByTestId('slot-card-away')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => medals(page)).toBe(await bankBalance(page));
  await spin(page);
  await settledLine(page);
  await expect.poll(() => bankBalance(page)).toBe(await medals(page));
});

test('the Medal Pusher opened in another tab takes the medals from the slot machine, and both show the same count', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page);
  await spin(page);
  await settledLine(page);
  const pusher = await context.newPage();
  await pusher.goto('/games/medal-pusher');
  await settled(pusher);
  await expect(page.getByTestId('slot-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(spinButton(page)).toBeDisabled();
  const onPusher = async () => Number(((await pusher.locator('#pusher-panel-machine').getByTestId('pusher-credits').textContent()) ?? '').replace(/,/g, ''));
  await expect.poll(onPusher, { timeout: 15_000 }).toBe(await bankBalance(pusher));
  expect(await onPusher()).toBe(await medals(page));
});

test('the reset at the medal center starts the machine over with a new member’s medals', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page);
  await force(page);
  await spin(page);
  await unforce(page);
  await settledLine(page);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME + 999));
  await resetAtCenter(page);
  await openSlots(page);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME));
  expect(await stat(page, 'Spins')).toBe(0);
  // This device's machine is written down as started over in the new era, once.
  await expect.poll(async () => {
    const ledger = await storedBank(page);
    return ledger ? (ledger.restarted[`${SLOT_GAME}@${ledger.device}`] ?? -1) : -1;
  }).toBe(1);
  await spin(page);
  await settledLine(page);
  await expect.poll(() => bankBalance(page)).toBe(await medals(page));
});

test('says once that the machine plays with the player’s medals now, and fits a phone in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Whatever a device kept under the machine's names before (it never saved its old count) is passed over.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('slot-machine-seeded') !== null) return;
    window.localStorage.setItem('slot-machine-seeded', '1');
    window.localStorage.setItem('slot-machine', JSON.stringify({ credits: 500, bet: 10 }));
    window.localStorage.setItem('slot-machine-round', JSON.stringify({ credits: 500 }));
  });
  await openSlots(page);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME));
  const notice = page.getByTestId('slot-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('now plays with your medals from the Medal Game Center');
  await expect(page.getByTestId('slot-notice-link')).toHaveAttribute('href', '/games/medal-center');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  await spin(page);
  await settledLine(page);
  await page.getByTestId('slot-notice-dismiss').click();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), NOTICE_KEY)).toBe('1');
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('slot-notice')).toHaveCount(0);

  await openSlots(page, 'ja');
  await expect(page.getByTestId('slot-not-money')).toHaveText(NOT_MONEY.ja);
  await expect(page.getByRole('radio', { name: '3枚ベット' })).toBeVisible();
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});

test('the pay glass shows each line at 1, 2 and 3 medals, with the column of the bet lit', async ({ page }) => {
  await openSlots(page);
  const glass = page.getByTestId('slot-paytable');
  await expect(glass.locator('thead th')).toHaveText(['Line', 'BET 1', 'BET 2', 'BET 3']);
  await expect(glass.locator('th[aria-current="true"]')).toHaveText('BET 1');
  // The 7-7-7 row: 1,000, 2,000 and 3,000.
  await expect(glass.locator('tbody tr').first().locator('td')).toHaveText(['1,000', '2,000', '3,000']);
  await page.getByTestId('slot-bet-3').click();
  await expect(glass.locator('th[aria-current="true"]')).toHaveText('BET 3');
  await expect(glass.locator('tbody tr').last().locator('td')).toHaveText(['2', '4', '6']);
});

test('with fewer medals left than the bet, the machine says why SPIN cannot be pressed, under the last result', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page);
  await page.getByTestId('slot-bet-3').click();
  // Losing spins at three medals until one is left.
  await page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => 0.999;
  });
  for (let left = WELCOME; left >= 3; left -= 3) {
    await spinButton(page).click();
    await expect(page.getByTestId('slot-medals')).toHaveText(count(left - 3));
    await settledLine(page);
  }
  await unforce(page);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME % 3));
  await expect(spinButton(page)).toBeDisabled();
  await expect(page.getByTestId('slot-result')).toHaveText('No win');
  await expect(page.getByTestId('slot-short')).toHaveText('Not enough medals to bet 3 — choose a smaller bet.');
  // A bet the medals cover: the note goes, and the machine spins again.
  await page.getByTestId('slot-bet-1').click();
  await expect(page.getByTestId('slot-short')).toHaveCount(0);
  await expect(spinButton(page)).toBeEnabled();
});

test('the exact odds tab shows the computed paytable and virtual reels', async ({ page }) => {
  await openSlots(page);
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await expect(page.getByTestId('slot-rtp')).toHaveText('95.262%');
  await expect(page.locator('tr[data-rule]')).toHaveCount(7);
  await expect(page.locator('tr[data-rule="seven3"]')).toContainText('0.00038%');
  await expect(page.getByText('249,724 ÷ 262,144')).toBeVisible();
  await expect(page.locator('li[title$="of 64 virtual stops"]')).toHaveCount(66);
  await expect(page.getByText(/12× as often as the jackpot/)).toBeVisible();
});

test('the simulations run and report against the theory', async ({ page }) => {
  await openSlots(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();

  await page.getByLabel('Number of spins').selectOption('10000');
  await page.getByRole('button', { name: 'Run' }).first().click();
  await expect(page.getByTestId('slot-convergence-result')).toContainText('After 10,000 spins the observed return was');

  await page.getByLabel('Medals bet per spin').selectOption('3');
  await page.getByLabel('Players (sessions)').fill('300');
  await page.getByRole('button', { name: 'Run' }).nth(1).click();
  const results = page.getByTestId('slot-session-results');
  await expect(results).toBeVisible({ timeout: 20_000 });
  await expect(results).toContainText('Ran out of medals');
  await expect(results).toContainText('Expected medals left');
});

test('the slot machine is localized', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page, 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('スロットマシン');
  await expect(page.getByRole('tab', { name: '正確な確率' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'レバーを引いて回す' })).toBeVisible();
  await expect(page.getByTestId('slot-center')).toHaveText('← メダルゲームセンター');
});

/** What an LED meter shows (its `data-shown`), as a number. */
const led = (page: Page, id: string) => page.getByTestId(id).evaluate((el) => Number((el as HTMLElement).dataset.shown));

test('a win runs into the medals on the meters, the WIN meter counting up beside them, and the next spin ends the count', async ({ page }) => {
  await openSlots(page);
  // A jackpot at one medal: 1,000 medals.
  await force(page);
  await spin(page);
  await unforce(page);
  await settledLine(page);
  // The medals are the player's at once (and in type for a screen reader); the LEDs are still counting.
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 1 + 1000));
  const early = { medals: await led(page, 'slot-medals-led'), win: await led(page, 'slot-win-led') };
  expect(early.medals).toBeGreaterThanOrEqual(WELCOME - 1);
  expect(early.medals).toBeLessThan(WELCOME - 1 + 1000);
  expect(early.win).toBeLessThan(1000);
  await page.waitForTimeout(400);
  expect(await led(page, 'slot-medals-led')).toBeGreaterThan(early.medals);
  // They end exactly on what the player has and on the win, in no more than the longest count.
  await expect.poll(() => led(page, 'slot-medals-led'), { timeout: 4_000 }).toBe(WELCOME - 1 + 1000);
  expect(await led(page, 'slot-win-led')).toBe(1000);

  // The next jackpot's count is ended by the spin after it: its bet takes a medal and the meter shows the rest at once.
  await force(page);
  await spin(page);
  await unforce(page);
  await settledLine(page);
  expect(await led(page, 'slot-medals-led')).toBeLessThan(WELCOME - 2 + 2000);
  await page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => 0.999;
  });
  await spinButton(page).click();
  await unforce(page);
  await expect.poll(() => led(page, 'slot-medals-led'), { timeout: 1_000 }).toBe(WELCOME - 3 + 2000);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 3 + 2000));
});

test('under reduced motion a win is on the meters at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page);
  await force(page);
  // Under reduced motion the reels stop 250 ms after the lever, too soon to be sure of catching them turning on a busy
  // machine, so the lever is pulled without `spin`, which waits to see them turn; the medals say the spin was made.
  await expect(spinButton(page)).toBeEnabled({ timeout: 20_000 });
  await spinButton(page).click();
  await unforce(page);
  await expect(page.getByTestId('slot-medals')).toHaveText(count(WELCOME - 1 + 1000));
  expect(await settledLine(page)).toEqual(['seven', 'seven', 'seven']);
  await expect(page.getByTestId('slot-medals-led')).toHaveAttribute('data-shown', String(WELCOME - 1 + 1000), { timeout: 500 });
  await expect(page.getByTestId('slot-win-led')).toHaveAttribute('data-shown', '1000');
});
