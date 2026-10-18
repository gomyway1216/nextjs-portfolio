import { test, expect, type Page } from '@playwright/test';

import {
  ACHIEVEMENT_IDS,
  BONUS_CARD,
  RECORDS_KEY,
  claim,
  createBook,
  dayFrom,
  dayNumber,
  dayOf,
  parseBook,
  serializeBook,
  viewOf,
} from '../../src/components/game/MedalPusher/records';
import { START_CREDITS } from '../../src/components/game/MedalPusher/session';
import { bankBalance, openCenter, resetAtCenter } from './medalCenterPage';
import { settled } from './medalPusherPage';
import { onPageError } from './pageErrors';
import { quietFloor } from './quietFloor';

// The Medal Pusher's daily bonus and record book. The machine itself is covered in medal-pusher.spec.ts; these
// check what is the player's own: the stamp card, the Records tab, and that neither gets in the machine's way.

async function openGame(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/medal-pusher');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until it has all arrived.
  await settled(page);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
}

// Every tab panel stays mounted, so everything is looked up inside its own panel.
const machine = (page: Page) => page.locator('#pusher-panel-machine');
const records = (page: Page) => page.locator('#pusher-panel-records');
const bonus = (page: Page) => machine(page).getByTestId('pusher-bonus');
const takeButton = (page: Page) => machine(page).getByTestId('pusher-bonus-take');

/** A counter of the machine as a number. */
async function counter(page: Page, id: string): Promise<number> {
  const text = (await machine(page).getByTestId(`pusher-${id}`).textContent()) ?? '';
  return Number(text.replace(/,/g, ''));
}

/** Feeds one medal into a rail with its button, retrying until hydration has attached the handlers. */
async function feedOne(page: Page, rail: 'left' | 'right' = 'left') {
  const before = await counter(page, 'played');
  await expect(async () => {
    await machine(page).getByTestId(`pusher-feed-${rail}`).click({ timeout: 1_000 });
    expect(await counter(page, 'played')).toBeGreaterThan(before);
  }).toPass({ timeout: 20_000 });
}

/** The record book the browser holds, read the way the game reads it, or null when it holds none. */
async function savedBook(page: Page) {
  return parseBook(await page.evaluate((key) => window.localStorage.getItem(key), RECORDS_KEY));
}

const sideways = (page: Page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));

/** Collects what would show that the page the server sent and the page in the browser disagreed, and any error nobody caught. */
function watchForTrouble(page: Page): string[] {
  const trouble: string[] = [];
  onPageError(page, (error) => trouble.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (/hydrat|Minified React error #4(18|23|25)/i.test(text)) trouble.push(`${message.type()}: ${text}`);
  });
  return trouble;
}

test('the bonus plate and the Records tab fit a phone, cover nothing, and read in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const trouble = watchForTrouble(page);
  await openGame(page);

  // The plate is under the cabinet: below the controls, above the tally, inside the page, with a button big enough for a thumb.
  await expect(bonus(page)).toHaveAttribute('data-state', 'ready');
  await expect(machine(page).getByTestId('pusher-bonus-status')).toHaveText(`Day 1 is ready: ${BONUS_CARD[0]} medals.`);
  // The medals are what a machine starts with: nothing is given until the button is pressed.
  expect(await counter(page, 'credits')).toBe(START_CREDITS);
  expect((await sideways(page)).scroll).toBeLessThanOrEqual(375);
  await bonus(page).scrollIntoViewIfNeeded();
  const [plate, controls, tally, take] = await Promise.all([
    bonus(page).boundingBox(),
    machine(page).getByTestId('pusher-controls').boundingBox(),
    machine(page).getByTestId('pusher-played').boundingBox(),
    takeButton(page).boundingBox(),
  ]);
  if (!plate || !controls || !tally || !take) throw new Error('the plate has no box');
  expect(plate.x).toBeGreaterThanOrEqual(0);
  expect(plate.x + plate.width).toBeLessThanOrEqual(375);
  expect(plate.y).toBeGreaterThanOrEqual(controls.y + controls.height);
  expect(plate.y + plate.height).toBeLessThanOrEqual(tally.y);
  expect(take.height).toBeGreaterThanOrEqual(44);
  expect(take.x + take.width).toBeLessThanOrEqual(plate.x + plate.width);

  // Nothing lies over the field or the controls: what is under the middle of each is the thing itself.
  for (const id of ['pusher-field', 'pusher-feed-left', 'pusher-feed-right', 'pusher-auto']) {
    const target = machine(page).getByTestId(id);
    await target.scrollIntoViewIfNeeded();
    const onTop = await target.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return top === element || element.contains(top);
    });
    expect(onTop, id).toBe(true);
  }
  // The place a stamp's toast will hang in is empty, and takes up no room.
  await expect(machine(page).getByTestId('pusher-toast')).toBeEmpty();
  expect((await machine(page).getByTestId('pusher-toast').boundingBox())?.height ?? 0).toBe(0);

  // The four tabs are in one row inside the page, and Records is the fourth, with a dot on it while the bonus waits.
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(3)).toHaveText('Records');
  await expect(page.getByTestId('pusher-bonus-dot')).toHaveCount(1);
  const row = await Promise.all([0, 1, 2, 3].map((index) => tabs.nth(index).boundingBox()));
  for (const tab of row) {
    if (!tab || !row[0]) throw new Error('a tab has no box');
    expect(Math.abs(tab.y - row[0].y)).toBeLessThan(2);
    expect(tab.x + tab.width).toBeLessThanOrEqual(375);
  }

  // The Records tab: the card with its seven squares, the board of an empty book, and the sheet with nothing stamped.
  await page.getByRole('tab', { name: 'Records' }).click();
  await expect(records(page)).toBeVisible();
  await expect(machine(page)).toBeHidden();
  await expect(records(page).getByTestId('pusher-records')).toHaveAttribute('data-loaded', 'true');
  expect((await sideways(page)).scroll).toBeLessThanOrEqual(375);
  const card = records(page).getByTestId('pusher-card');
  await expect(card).toHaveAttribute('data-state', 'ready');
  await expect(card.getByTestId('pusher-card-squares').locator('li')).toHaveCount(BONUS_CARD.length);
  await expect(card.locator('li[data-today="true"]')).toHaveCount(1);
  await expect(card.locator('li[data-stamped="true"]')).toHaveCount(0);
  await expect(card.getByTestId('pusher-card-status')).toHaveText(`Day 1 is ready: ${BONUS_CARD[0]} medals.`);
  await expect(card).toContainText('not counted as fed, won or paid');
  const cardBox = await card.boundingBox();
  const squares = await card
    .getByTestId('pusher-card-squares')
    .locator('li')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map((box) => ({ x: box.x, width: box.width, height: box.height })));
  if (!cardBox) throw new Error('the card has no box');
  for (const square of squares) {
    expect(square.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(square.x + square.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    expect(square.height).toBeGreaterThanOrEqual(48);
  }
  await expect(records(page).getByTestId('pusher-record-fed')).toHaveText('0');
  await expect(records(page).getByTestId('pusher-record-return')).toHaveText('—');
  await expect(records(page).getByTestId('pusher-record-days')).toHaveText('0');
  // The four figures the board leads with are rows further down as well: each is read by its own name.
  await expect(records(page).getByTestId('pusher-headline-won')).toHaveText('0');
  await expect(records(page).getByTestId('pusher-headline-return')).toHaveText('—');
  await expect(records(page).getByTestId('pusher-headline-prize')).toHaveText('—');
  await expect(records(page).getByTestId('pusher-headline-jackpots')).toHaveText('0');
  for (const figure of ['won', 'prize', 'jackpots']) {
    await expect(records(page).getByTestId(`pusher-record-${figure}`)).toHaveText(figure === 'prize' ? '—' : '0');
  }
  // No two things on the tab answer to one name, so every one of them can be asked for.
  const names = await records(page)
    .locator('[data-testid]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid') ?? ''));
  expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  await expect(records(page).getByTestId('pusher-achievements-count')).toHaveText(`0 of ${ACHIEVEMENT_IDS.length} stamped`);
  await expect(records(page).getByTestId('pusher-achievements').locator('li')).toHaveCount(ACHIEVEMENT_IDS.length);
  await expect(records(page).getByTestId('pusher-records-kept')).toHaveAttribute('data-kept', 'true');
  // Nobody is signed in: the book is this device's alone, and clearing it is said to reach no account.
  await expect(records(page).getByTestId('pusher-records-kept')).toHaveAttribute('data-where', 'device');
  await expect(records(page).getByTestId('pusher-records-clear-account')).toHaveCount(0);
  // The rows that chance time added to the board, and the one the lucky lamp did.
  await expect(records(page).getByTestId('pusher-record-golds')).toHaveText('0');
  await expect(records(page).getByTestId('pusher-record-luckies')).toHaveText('0');
  await expect(records(page).getByTestId('pusher-record-chances')).toHaveText('0');

  // In Japanese.
  await openGame(page, 'ja');
  await expect(bonus(page)).toHaveAttribute('data-state', 'ready');
  await expect(bonus(page)).toContainText('デイリーボーナス');
  await expect(machine(page).getByTestId('pusher-bonus-status')).toHaveText(`1日目のボーナスを受け取れます: ${BONUS_CARD[0]}枚`);
  await expect(page.getByRole('tab', { name: '記録' })).toBeVisible();
  await page.getByRole('tab', { name: '記録' }).click();
  await expect(records(page)).toContainText('デイリースタンプカード');
  await expect(records(page)).toContainText('記録ボード');
  await expect(records(page)).toContainText('実績スタンプ');
  await expect(records(page).getByTestId('pusher-record-days')).toHaveText('0日');
  expect((await sideways(page)).scroll).toBeLessThanOrEqual(375);
  expect(trouble).toEqual([]);
});

test('the daily bonus is taken once a day, adds exactly what the card says, and is back the next day', async ({ page }) => {
  // The page's clock is set to the middle of a day wherever the test runs, and moved on by hand.
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  const trouble = watchForTrouble(page);
  await openGame(page);

  await expect(bonus(page)).toHaveAttribute('data-state', 'ready');
  await expect(machine(page).getByTestId('pusher-bonus-status')).toHaveText(`Day 1 is ready: ${BONUS_CARD[0]} medals.`);
  await expect(page.getByTestId('pusher-bonus-dot')).toHaveCount(1);
  // Offered, not given: the medals are a new machine's until the button is pressed.
  expect(await counter(page, 'credits')).toBe(START_CREDITS);
  await expect(takeButton(page)).toHaveText(`TAKE +${BONUS_CARD[0]} medals: today’s daily bonus`);

  await takeButton(page).click();
  await expect(bonus(page)).toHaveAttribute('data-state', 'taken');
  await expect.poll(() => counter(page, 'credits')).toBe(START_CREDITS + BONUS_CARD[0]);
  await expect(machine(page).getByTestId('pusher-announcement')).toContainText(`Daily bonus: ${BONUS_CARD[0]} medals`);
  await expect(machine(page).getByTestId('pusher-bonus-status')).toHaveText(`Stamped today: +${BONUS_CARD[0]} medals. Tomorrow: +${BONUS_CARD[1]}.`);
  // Once is all: the button is gone, and so is the dot on the tab.
  await expect(takeButton(page)).toHaveCount(0);
  await expect(page.getByTestId('pusher-bonus-dot')).toHaveCount(0);
  // Free medals are not played, won or paid: the machine's return has nothing to work from yet.
  expect(await counter(page, 'played')).toBe(0);
  expect(await counter(page, 'won')).toBe(0);
  expect(await counter(page, 'paid')).toBe(0);
  await expect(machine(page).getByTestId('pusher-return')).toHaveText('—');
  // The medals are in the medal bank at once, and the book has the day in it.
  await expect.poll(() => bankBalance(page)).toBe(START_CREDITS + BONUS_CARD[0]);
  const book = await savedBook(page);
  if (!book) throw new Error('no record book was saved');
  expect(viewOf(book).total).toMatchObject({ claims: 1, bonus: BONUS_CARD[0], fed: 0, won: 0 });

  // Loaded again the same day, it is not offered again, and the medals are where they were left.
  await page.reload();
  await settled(page);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
  await expect(bonus(page)).toHaveAttribute('data-state', 'taken');
  await expect(takeButton(page)).toHaveCount(0);
  await expect.poll(() => counter(page, 'credits'), { timeout: 15_000 }).toBe(START_CREDITS + BONUS_CARD[0]);
  // The card on the Records tab has the day's stamp.
  await page.getByRole('tab', { name: 'Records' }).click();
  await expect(records(page).getByTestId('pusher-card').locator('li[data-stamped="true"]')).toHaveCount(1);
  await expect(records(page).getByTestId('pusher-card-take')).toHaveCount(0);
  await expect(records(page).getByTestId('pusher-record-bonus')).toHaveText(String(BONUS_CARD[0]));
  await page.getByRole('tab', { name: 'Machine' }).click();

  // A day later, on the page as it stands: the second square is ready without loading anything, and gives what it says.
  await page.clock.fastForward('24:00:00');
  await expect(bonus(page)).toHaveAttribute('data-state', 'ready');
  await expect(machine(page).getByTestId('pusher-bonus-status')).toHaveText(`Day 2 is ready: ${BONUS_CARD[1]} medals.`);
  await takeButton(page).click();
  await expect(bonus(page)).toHaveAttribute('data-state', 'taken');
  await expect.poll(() => counter(page, 'credits')).toBe(START_CREDITS + BONUS_CARD[0] + BONUS_CARD[1]);
  await expect(takeButton(page)).toHaveCount(0);
  expect(trouble).toEqual([]);
});

test('the records count what is played, outlast a reset of the medal center, and are cleared only on purpose', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);
  await feedOne(page, 'left');
  await page.waitForTimeout(300);
  await feedOne(page, 'right');
  await page.waitForTimeout(300);
  const played = await counter(page, 'played');
  expect(played).toBeGreaterThanOrEqual(2);
  await expect(bonus(page)).toHaveAttribute('data-state', 'ready');
  await takeButton(page).click();
  await expect(bonus(page)).toHaveAttribute('data-state', 'taken');

  // The book has what was fed, the day, and the bonus, which is kept apart from what was fed and won.
  await page.getByRole('tab', { name: 'Records' }).click();
  const fed = records(page).getByTestId('pusher-record-fed');
  await expect(fed).toHaveText(String(played));
  await expect(records(page).getByTestId('pusher-record-days')).toHaveText('1');
  await expect(records(page).getByTestId('pusher-record-bonus')).toHaveText(String(BONUS_CARD[0]));
  await expect(records(page).getByTestId('pusher-card').locator('li[data-stamped="true"]')).toHaveCount(1);

  // The medal center is reset: a new machine, a new member's medals and nothing played.
  await resetAtCenter(page);
  await openGame(page);
  await expect(machine(page).getByTestId('pusher-played')).toHaveText('0');
  await expect(machine(page).getByTestId('pusher-credits')).toHaveText(String(START_CREDITS));
  // The book is as it was, and the day's bonus is not offered a second time.
  await expect(bonus(page)).toHaveAttribute('data-state', 'taken');
  await expect(takeButton(page)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Records' }).click();
  await expect(fed).toHaveText(String(played));

  // It is kept in the browser under its own name, and is there after a reload.
  const fedInStorage = async () => {
    const book = await savedBook(page);
    return book ? viewOf(book).total.fed : -1;
  };
  await expect.poll(fedInStorage, { timeout: 20_000 }).toBe(played);
  await page.reload();
  await settled(page);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
  await page.getByRole('tab', { name: 'Records' }).click();
  await expect(fed).toHaveText(String(played));

  // Clearing takes two presses, and leaves the stamp card.
  const clear = records(page).getByTestId('pusher-records-clear');
  await expect(clear).toHaveText('Clear the records');
  await clear.click();
  await expect(clear).toHaveAttribute('data-armed', 'true');
  await expect(clear).toHaveText('Press again to clear the records');
  await expect(fed).toHaveText(String(played));
  await clear.click();
  await expect(clear).toHaveAttribute('data-armed', 'false');
  await expect(fed).toHaveText('0');
  await expect(records(page).getByTestId('pusher-record-days')).toHaveText('0');
  await expect(records(page).getByTestId('pusher-records-said')).toHaveText('The records have been cleared.');
  await expect(records(page).getByTestId('pusher-card').locator('li[data-stamped="true"]')).toHaveCount(1);
  await expect(records(page).getByTestId('pusher-card-take')).toHaveCount(0);
});

test('a stamp that is earned is shown once, in a toast that keeps off the controls wherever the page is scrolled', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await openGame(page);
  await expect(bonus(page)).toHaveAttribute('data-state', 'ready');

  // A card with six days in a row on it, the last of them yesterday on this browser's own calendar: today's stamp is
  // the seventh, and a week of days in a row earns the "Regular" stamp.
  const [year, month, date] = await page.evaluate(() => {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  });
  const today = dayNumber(dayFrom(year, month, date));
  if (today === null) throw new Error('the page has no day');
  let book = createBook('e2edevice1');
  for (let back = 6; back >= 1; back--) book = claim(book, dayOf(today - back)).book;
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [RECORDS_KEY, serializeBook(book)]);
  await page.reload();
  await settled(page);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
  await expect(machine(page).getByTestId('pusher-bonus-status')).toHaveText(`Day 7 is ready: ${BONUS_CARD[6]} medals.`);
  const toast = machine(page).getByTestId('pusher-toast');
  await expect(toast).toBeEmpty();

  await takeButton(page).click();
  await expect.poll(() => counter(page, 'credits')).toBe(START_CREDITS + BONUS_CARD[6]);
  await expect(toast).toContainText('Regular');
  await expect(toast).toContainText('Achievement stamped: Regular.');
  await expect(toast).toHaveAttribute('role', 'status');

  // Wherever the page is scrolled to, the toast lies over none of the controls, nor the line above them, and takes no press.
  for (const id of ['pusher-jackpot', 'pusher-field', 'pusher-legend', 'pusher-controls', 'pusher-bonus']) {
    await machine(page)
      .getByTestId(id)
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const over = await page.evaluate(() => {
      const box = (query: string) => document.querySelector(`#pusher-panel-machine ${query}`)?.getBoundingClientRect();
      const shown = box('[data-testid="pusher-toast"] > div');
      const overlap = (other: DOMRect | undefined) => (shown && other ? Math.max(0, Math.min(shown.bottom, other.bottom) - Math.max(shown.top, other.top)) : -1);
      return { controls: overlap(box('[data-testid="pusher-controls"]')), legend: overlap(box('[data-testid="pusher-legend"]')), bonus: overlap(box('[data-testid="pusher-bonus"]')) };
    });
    expect(over, `scrolled to ${id}`).toEqual({ controls: 0, legend: 0, bonus: 0 });
  }
  await machine(page).getByTestId('pusher-feed-left').scrollIntoViewIfNeeded();
  const pressable = await machine(page)
    .getByTestId('pusher-feed-left')
    .evaluate((button) => {
      const box = button.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + 4);
      return top === button || button.contains(top);
    });
  expect(pressable).toBe(true);

  // The stamp is on the sheet, with its day, and the card is full.
  await page.getByRole('tab', { name: 'Records' }).click();
  await expect(records(page).locator('li[data-achievement="week"]')).toHaveAttribute('data-earned', 'true');
  await expect(records(page).getByTestId('pusher-achievements-count')).toHaveText(`1 of ${ACHIEVEMENT_IDS.length} stamped`);
  await expect(records(page).getByTestId('pusher-card').locator('li[data-stamped="true"]')).toHaveCount(BONUS_CARD.length);
  await page.getByRole('tab', { name: 'Machine' }).click();

  // The toast leaves by itself after its few seconds, and is not shown a second time when the page is loaded again.
  await page.clock.fastForward(8_000);
  await expect(toast).toBeEmpty();
  await page.reload();
  await settled(page);
  await expect(bonus(page)).toHaveAttribute('data-state', 'taken');
  await expect(toast).toBeEmpty();
});

test('two tabs of the game pay a day’s bonus once between them, and both end up showing it taken', async ({ page, context }) => {
  await openGame(page);
  const other = await context.newPage();
  await openGame(other);
  await expect(bonus(page)).toHaveAttribute('data-state', 'ready');
  await expect(bonus(other)).toHaveAttribute('data-state', 'ready');

  // Both tabs reach for today's bonus at the same moment: both buttons are pressed before either tab has heard of the
  // other's press. (Pressed in the page itself: the button that comes second can be gone by the time a click made from
  // outside gets to it, which is the very thing being tested.)
  await Promise.all([page, other].map((tab) => takeButton(tab).evaluate((button: HTMLButtonElement) => button.click())));
  // One of them was paid, and the other hears of it: both show the day taken, with nothing left to press.
  for (const tab of [page, other]) {
    await expect(bonus(tab)).toHaveAttribute('data-state', 'taken');
    await expect(takeButton(tab)).toHaveCount(0);
  }
  // The one book they share counts one bonus, and its medals once.
  await expect
    .poll(async () => {
      const book = await savedBook(page);
      return book ? [viewOf(book).total.claims, viewOf(book).total.bonus] : [];
    })
    .toEqual([1, BONUS_CARD[0]]);
  // The medals are the medal bank's, which both tabs play from: both show the bonus in it, once. A tab's machine only
  // runs while the tab is in front.
  await expect.poll(() => bankBalance(page)).toBe(START_CREDITS + BONUS_CARD[0]);
  for (const tab of [page, other]) {
    await tab.bringToFront();
    await expect.poll(() => counter(tab, 'credits')).toBe(START_CREDITS + BONUS_CARD[0]);
  }

  // Pressing again in either, after a reload, pays nothing more.
  await other.reload();
  await settled(other);
  await expect(bonus(other)).toHaveAttribute('data-state', 'taken');
  await expect(takeButton(other)).toHaveCount(0);
  const book = await savedBook(other);
  expect(book ? viewOf(book).total.claims : -1).toBe(1);
});

test('bonuses taken at the medal center are stamped on the cabinet’s card, and its board says it counts only its own', async ({ page }) => {
  test.setTimeout(60_000);
  await quietFloor(page.context());
  await page.setViewportSize({ width: 375, height: 812 });
  // Two evenings in Japan, the bonus taken at the medal center's counter each time, never at the cabinet.
  await page.clock.install({ time: new Date('2026-10-12T11:00:00Z') });
  for (const evening of [0, 1]) {
    if (evening > 0) await page.clock.setSystemTime(new Date('2026-10-13T11:00:00Z'));
    await openCenter(page, 'ja');
    await expect(page.getByTestId('pusher-bonus-take')).toBeVisible();
    await page.getByTestId('pusher-bonus-take').click();
    await expect(page.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  }
  await openGame(page, 'ja');
  await page.getByRole('tab', { name: '記録' }).click();
  // There is one card, the medal center's: both days are stamped on it, and it says where a bonus can be taken.
  const card = records(page).getByTestId('pusher-card');
  await expect(card.locator('li[data-stamped="true"]')).toHaveCount(2);
  await expect(card).toContainText('カードは1枚だけで、メダルゲームセンターで受け取っても、この台で受け取っても押されます。');
  // The board is the cabinet's: it took no bonus itself, and its rows say that what they count is the cabinet's.
  const board = records(page).getByTestId('pusher-records-board');
  await expect(board.getByRole('heading', { name: 'この台で遊んだ日' })).toBeVisible();
  const claims = records(page).getByTestId('pusher-record-claims');
  await expect(claims).toHaveText('0回');
  await expect(claims.locator('xpath=preceding-sibling::dt')).toHaveText('この台で受け取ったボーナス');
  await expect(records(page).getByTestId('pusher-record-bonus').locator('xpath=preceding-sibling::dt')).toHaveText('この台で受け取ったボーナスのメダル');
  await expect(records(page).locator('[data-achievement="week"]')).toContainText('この台で7日続けて遊ぶ。');
});
