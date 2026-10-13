import { test, expect, type Page } from '@playwright/test';

import { ACHIEVEMENT_IDS, BONUS_CARD, RECORDS_KEY, parseBook, viewOf } from '../../src/components/game/MedalPusher/records';
import { START_CREDITS } from '../../src/components/game/MedalPusher/session';
import { STORAGE_KEY, restore } from '../../src/components/game/MedalPusher/storage';

// The Medal Pusher's daily bonus and record book. The machine itself is covered in medal-pusher.spec.ts; these
// check what is the player's own: the stamp card, the Records tab, and that neither gets in the machine's way.

async function openGame(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/medal-pusher');
  expect(response?.status()).toBe(200);
  // While the page streams in, React briefly keeps a second, hidden copy of the content in the document.
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
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

/** The medals in the machine the browser holds a save of, read the way the game reads it. */
async function savedCredits(page: Page): Promise<number> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  return restore(text, 1)?.credits ?? -1;
}

/** The record book the browser holds, read the way the game reads it, or null when it holds none. */
async function savedBook(page: Page) {
  return parseBook(await page.evaluate((key) => window.localStorage.getItem(key), RECORDS_KEY));
}

const sideways = (page: Page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));

/** Collects what would show that the page the server sent and the page in the browser disagreed, and any error nobody caught. */
function watchForTrouble(page: Page): string[] {
  const trouble: string[] = [];
  page.on('pageerror', (error) => trouble.push(`uncaught: ${error.message}`));
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
  await expect(records(page).getByTestId('pusher-achievements-count')).toHaveText(`0 of ${ACHIEVEMENT_IDS.length} stamped`);
  await expect(records(page).getByTestId('pusher-achievements').locator('li')).toHaveCount(ACHIEVEMENT_IDS.length);
  await expect(records(page).getByTestId('pusher-records-kept')).toHaveAttribute('data-kept', 'true');

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
  // The machine is saved with the medals in it, and the book with the day in it, at once.
  await expect.poll(() => savedCredits(page)).toBe(START_CREDITS + BONUS_CARD[0]);
  const book = await savedBook(page);
  if (!book) throw new Error('no record book was saved');
  expect(viewOf(book).total).toMatchObject({ claims: 1, bonus: BONUS_CARD[0], fed: 0, won: 0 });

  // Loaded again the same day, it is not offered again, and the medals are where they were left.
  await page.reload();
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
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

test('the records count what is played, outlast a reset of the machine, and are cleared only on purpose', async ({ page }) => {
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

  // The machine is reset: a new machine with a new purse and nothing played.
  await page.getByRole('tab', { name: 'Machine' }).click();
  const reset = machine(page).getByTestId('pusher-reset');
  await reset.click();
  await expect(reset).toHaveAttribute('data-armed', 'true');
  await reset.click();
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
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
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
