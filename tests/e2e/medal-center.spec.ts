import { test, expect, type Page } from '@playwright/test';

import { BANKED_KEY, BANK_KEY, PUSHER } from '../../src/components/game/MedalCenter/bank';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { BONUS_CARD } from '../../src/components/game/MedalPusher/records';
import { START_CREDITS, createSession } from '../../src/components/game/MedalPusher/session';
import { STORAGE_KEY, restore, serialize } from '../../src/components/game/MedalPusher/storage';
import { bankBalance, openCenter, storedBank } from './medalCenterPage';
import { settled } from './medalPusherPage';
import { onPageError } from './pageErrors';
import { pressUntil } from './pressUntil';
import { quietFloor } from './quietFloor';

// The floor's API answers at once (quietFloor.ts): its 6 s waits on CI hold up navigation from the hub to a machine.
test.beforeEach(async ({ context }) => quietFloor(context));

// The medal center's front and its one medal bank, which the Medal Pusher plays from. The machine itself is covered in
// medal-pusher.spec.ts; these check the medals: where they are, that every machine and page sees the same ones, and
// that none is lost or made twice.

const machine = (page: Page) => page.locator('#pusher-panel-machine');

async function openPusher(page: Page) {
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/medal-pusher');
  expect(response?.status()).toBe(200);
  await settled(page);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
}

/** A counter of the machine as a number. */
async function counter(page: Page, id: string): Promise<number> {
  const text = (await machine(page).getByTestId(`pusher-${id}`).textContent()) ?? '';
  return Number(text.replace(/,/g, ''));
}

/** The medals on the medal center's counter. */
async function shownAtCenter(page: Page): Promise<number> {
  return Number(((await page.getByTestId('center-balance').textContent()) ?? '').replace(/,/g, ''));
}

/** Feeds one medal into the left rail, retrying until hydration has attached the handlers and the card is here. */
async function feedOne(page: Page) {
  const before = await counter(page, 'played');
  await pressUntil(machine(page).getByTestId('pusher-feed-left'), async () => (await counter(page, 'played')) > before);
}

/** A Medal Pusher saved before there was a bank, with its own purse, put in this browser before the page opens. */
async function oldPusher(page: Page, credits: number) {
  const session = createSession(5, { balls: 0 });
  session.credits = credits;
  const save = serialize(session);
  expect(restore(save, 1)?.credits).toBe(credits);
  await page.addInitScript(
    ([key, text]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text);
    },
    [STORAGE_KEY, save],
  );
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test('shows a new member’s medals on a big counter, the floor and the one reset, at a phone’s width, in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  await openCenter(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('MEDAL GAME CENTER');
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('center-member')).toHaveText('Guest');
  await expect(page.getByTestId('center-where')).toHaveAttribute('data-where', 'device');
  // It says, under the counter, that the medals are not money.
  await expect(page.getByTestId('center-not-money')).toHaveText(NOT_MONEY.en);
  // The bank is written down at once, as a new member's.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME);
  // The floor: the Medal Pusher and the casino games already on the medals open and linked, the ones still to come shown
  // as not open yet; all fifteen machines are on it, one way or the other.
  await expect(page.getByTestId('center-play-medal-pusher')).toHaveAttribute('href', '/games/medal-pusher');
  await expect(page.getByTestId('center-play-slot-machine')).toHaveAttribute('href', '/games/slot-machine');
  await expect(page.getByTestId('center-play-janken')).toHaveAttribute('href', '/games/janken');
  await expect(page.getByTestId('center-play-roulette')).toHaveAttribute('href', '/games/roulette');
  await expect(page.getByTestId('center-play-blackjack')).toHaveAttribute('href', '/games/blackjack');
  await expect(page.getByTestId('center-play-video-poker')).toHaveAttribute('href', '/games/video-poker');
  await expect(page.getByTestId('center-play-baccarat')).toHaveAttribute('href', '/games/baccarat');
  await expect(page.getByTestId('center-play-craps')).toHaveAttribute('href', '/games/craps');
  await expect(page.getByTestId('center-play-three-card-poker')).toHaveAttribute('href', '/games/three-card-poker');
  await expect(page.getByTestId('center-play-fishing')).toHaveAttribute('href', '/games/fishing');
  await expect(page.getByTestId('center-play-horse-race')).toHaveAttribute('href', '/games/horse-race');
  await expect(page.getByTestId('center-play-ball-bingo')).toHaveAttribute('href', '/games/ball-bingo');
  await expect(page.getByTestId('center-play-big-wheel')).toHaveAttribute('href', '/games/big-wheel');
  await expect(page.getByTestId('center-play-high-low')).toHaveAttribute('href', '/games/high-low');
  await expect(page.getByTestId('center-play-sic-bo')).toHaveAttribute('href', '/games/sic-bo');
  for (const id of ['slot-machine', 'janken', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'craps', 'three-card-poker', 'fishing', 'horse-race', 'ball-bingo', 'big-wheel', 'high-low', 'sic-bo']) {
    await expect(page.getByTestId('center-soon').locator(`li[data-machine="${id}"]`)).toHaveCount(0);
  }
  // Fifteen machines on the floor: those open, and the rest shown as coming.
  expect((await page.getByTestId('center-machines').locator('li').count()) + (await page.getByTestId('center-soon').locator('li').count())).toBe(15);
  // The daily bonus is here too, and the one reset, which nothing has pressed.
  await expect(page.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('center-reset')).toBeEnabled();
  await expect(page.getByTestId('center-reset-dialog')).toHaveCount(0);
  expect(await sideways(page)).toBeLessThanOrEqual(375);

  await openCenter(page, 'ja');
  await expect(page.getByTestId('center-reset')).toHaveText('メダルをリセット');
  await expect(page.locator('#center-counter-label')).toHaveText('持ちメダル');
  await expect(page.getByTestId('center-not-money')).toHaveText(NOT_MONEY.ja);
  await expect(page.getByTestId('center-machines')).toContainText('スロットマシン');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});

test('the floor stands in corners under hanging signs: two cabinets a row on a phone, four on a desktop, each one a link by its name', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  await openCenter(page);
  // Each corner's sign is a heading, in the page's language (its Japanese is there for the look, not read twice).
  for (const sign of ['PUSHER CORNER', 'VIDEO & SLOTS', 'TABLE GAMES', 'KIDS & CANDY SHOP']) {
    await expect(page.getByRole('heading', { level: 3, name: sign, exact: true })).toBeVisible();
  }
  // Each cabinet is a link named by the machine, and the whole cabinet takes the tap.
  const slot = page.getByRole('link', { name: 'Slot Machine', exact: true });
  await expect(slot).toHaveAttribute('href', '/games/slot-machine');
  const box = async (id: string) => (await page.locator(`li[data-machine="${id}"]`).boundingBox())!;
  // On a phone: two to a row, and the pusher, a big cabinet, the whole row.
  const [slotBox, pokerBox, pusherBox] = [await box('slot-machine'), await box('video-poker'), await box('medal-pusher')];
  expect(Math.abs(slotBox.y - pokerBox.y)).toBeLessThan(2);
  expect(slotBox.width).toBeLessThan(375 / 2);
  expect(pusherBox.width).toBeGreaterThan(slotBox.width * 1.8);
  // A machine's own line, and its stickers.
  await expect(page.getByTestId('center-pitch-craps')).toHaveText('Roll the dice; the odds bet pays true odds.');
  await expect(page.getByTestId('center-jp-slot-machine')).toBeVisible();
  await expect(page.getByTestId('center-jp-craps')).toHaveCount(0);
  // Pressed anywhere on the cabinet, not only on its name, it takes the player in.
  await page.locator('li[data-machine="craps"]').click();
  await expect(page).toHaveURL(/\/games\/craps$/);
  await openCenter(page);
  // Nothing moves when it is hovered, for a player who asks for less motion.
  await page.locator('li[data-machine="baccarat"]').hover();
  expect(await page.locator('li[data-machine="baccarat"]').evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  // By the keyboard: from one cabinet, Tab goes to the next, and the cabinet shows it has the focus. (Safari's Tab passes
  // links by, unless the player has asked otherwise in its settings; Option-Tab goes to every link and control there.)
  await page.getByTestId('center-play-roulette').focus();
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.getByTestId('center-play-blackjack')).toBeFocused();
  expect(await page.locator('li[data-machine="blackjack"]').evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  // At 320 px the floor still fits.
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await sideways(page)).toBeLessThanOrEqual(320);
  // On a desktop: the four tables in a row, the pusher's corner beside the video machines', and the two big machines side
  // by side across the floor.
  await page.setViewportSize({ width: 1280, height: 900 });
  const tables = await Promise.all(['roulette', 'blackjack', 'baccarat', 'craps'].map(box));
  for (const table of tables) expect(Math.abs(table.y - tables[0]!.y)).toBeLessThan(2);
  const sign = async (zone: string) => (await page.getByTestId(`center-zone-${zone}`).boundingBox())!.y;
  expect(Math.abs((await sign('pusher')) - (await sign('video')))).toBeLessThan(2);
  const [race, bingo] = [await box('horse-race'), await box('ball-bingo')];
  expect(Math.abs(race.y - bingo.y)).toBeLessThan(2);
  expect(race.width).toBeGreaterThan(slotBox.width * 1.8);
  expect(errors).toEqual([]);
});

test('every cabinet’s cover loads once it is scrolled into view, at a phone’s width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const broken: string[] = [];
  page.on('response', (response) => {
    // A cover comes through the image optimizer, its path in the query: decoded to be found.
    if (decodeURIComponent(response.url()).includes('/img/games/covers/') && response.status() >= 400) broken.push(`${response.status()} ${response.url()}`);
  });
  await openCenter(page);
  const tiles = page.getByTestId('center-machines').locator('li[data-machine]');
  const ids = await tiles.evaluateAll((items) => items.map((item) => item.getAttribute('data-machine') ?? ''));
  // Every machine on the floor has a cabinet.
  expect(ids.length).toBeGreaterThanOrEqual(12);
  for (const id of ids) {
    const tile = page.locator(`li[data-machine="${id}"]`);
    await tile.scrollIntoViewIfNeeded();
    // The covers load lazily, as they come near the screen: by the time the cabinet is in view, its cover has.
    await expect
      .poll(() => tile.locator('img').evaluate((image: HTMLImageElement) => (image.complete ? image.naturalWidth : 0)), { message: id, timeout: 15_000 })
      .toBeGreaterThan(0);
  }
  expect(broken).toEqual([]);
});

test('the Medal Pusher plays from the bank: a medal fed comes out of it, a medal won goes back, and the hub and the machine agree after a reload', async ({ page }) => {
  test.setTimeout(90_000);
  await openPusher(page);
  await expect(machine(page).getByTestId('pusher-credits')).toHaveText(String(START_CREDITS));
  await expect(page.getByTestId('pusher-center')).toHaveAttribute('href', '/games/medal-center');
  // Fed until a medal has come back over the front: Auto feeds two a second.
  await feedOne(page);
  await machine(page).getByTestId('pusher-auto').click();
  await expect.poll(() => counter(page, 'won'), { timeout: 45_000 }).toBeGreaterThan(0);
  await machine(page).getByTestId('pusher-auto').click();
  // The bank holds what it started with, less every medal fed, and every medal won back in it, as the machine counts them.
  await expect(async () => {
    const [played, won, credits, bank] = [await counter(page, 'played'), await counter(page, 'won'), await counter(page, 'credits'), await bankBalance(page)];
    expect(bank).toBe(START_CREDITS - played + won);
    expect(credits).toBe(bank);
  }).toPass({ timeout: 10_000 });
  // The machine is kept with no purse of its own: its medals are the bank's.
  await expect.poll(async () => restore(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY), 1)?.credits ?? -1, { timeout: 20_000 }).toBe(0);

  // After a reload the machine shows what the bank holds, and so does the medal center.
  await page.waitForTimeout(1_000);
  const bank = await bankBalance(page);
  await page.reload();
  await settled(page);
  // The field is still settling and may bring a medal back at any moment, so the machine and the bank are compared
  // afresh each time, never against a number read once.
  await expect.poll(async () => (await counter(page, 'credits')) - (await bankBalance(page)), { timeout: 15_000 }).toBe(0);
  const afterReload = await counter(page, 'credits');
  // A medal or two may have been won while the field settled; none was lost or made.
  expect(afterReload).toBeGreaterThanOrEqual(bank);
  await openCenter(page);
  // At the medal center no machine is playing, so the bank holds still: the counter shows it, and it holds every medal
  // the machine showed, and any it won after that.
  await expect.poll(async () => (await shownAtCenter(page)) - (await bankBalance(page))).toBe(0);
  expect(await shownAtCenter(page)).toBeGreaterThanOrEqual(afterReload);
});

test('the reset asks first, then empties the bank to a new member’s medals and starts the machine over; the bonus card is kept', async ({ page }) => {
  test.setTimeout(90_000);
  await openPusher(page);
  await feedOne(page);
  await feedOne(page);
  await page.getByTestId('pusher-bonus-take').click();
  await expect.poll(() => bankBalance(page)).toBe(START_CREDITS - (await counter(page, 'played')) + (await counter(page, 'won')) + BONUS_CARD[0]);
  await expect(page.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  const played = await counter(page, 'played');

  await openCenter(page);
  const before = await shownAtCenter(page);
  expect(before).toBeGreaterThan(WELCOME);
  // Asked first: the dialog says how many medals go, starts on the safe answer, and Escape and Cancel keep them.
  await page.getByTestId('center-reset').click();
  const dialog = page.getByTestId('center-reset-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'alertdialog');
  await expect(dialog).toContainText(`Your ${before.toLocaleString('en-US')} medals are thrown away`);
  await expect(page.getByTestId('center-reset-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByTestId('center-reset').click();
  await page.getByTestId('center-reset-cancel').click();
  await expect(dialog).toHaveCount(0);
  expect(await bankBalance(page)).toBe(before);
  // Yes.
  await page.getByTestId('center-reset').click();
  await page.getByTestId('center-reset-confirm').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('center-announcement')).toContainText('Your medals have been reset');
  expect(await bankBalance(page)).toBe(WELCOME);
  expect((await storedBank(page))?.era).toBe(1);
  // Today's bonus stays taken: a reset is not a way to take it again.
  await expect(page.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');

  // The machine starts over: nothing played, and the bank's medals on its counter.
  expect(played).toBeGreaterThan(0);
  await openPusher(page);
  await expect(machine(page).getByTestId('pusher-played')).toHaveText('0');
  await expect(machine(page).getByTestId('pusher-credits')).toHaveText(String(WELCOME));
  // This device's copy of the machine is written down as started over in the new era.
  await expect.poll(async () => {
    const ledger = await storedBank(page);
    return ledger ? (ledger.restarted[`${PUSHER.game}@${ledger.device}`] ?? -1) : -1;
  }).toBe(1);
  // And it is not started over again the next time.
  await feedOne(page);
  await page.waitForTimeout(6_000);
  await page.reload();
  await settled(page);
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('a Medal Pusher played before the bank has its purse moved into the bank once, and never again', async ({ page }) => {
  test.setTimeout(60_000);
  await oldPusher(page, 1234);
  await openCenter(page);
  // Its purse, and no new member's medals beside it.
  await expect(page.getByTestId('center-balance')).toHaveText('1,234');
  expect(await bankBalance(page)).toBe(1234);
  expect(JSON.parse((await page.evaluate((key) => window.localStorage.getItem(key), BANKED_KEY)) ?? '[]')).toEqual([PUSHER.guestPurse]);

  // The machine opens with the bank's medals, and is kept with an empty purse from then on.
  await openPusher(page);
  await expect.poll(() => counter(page, 'credits'), { timeout: 15_000 }).toBe(1234);
  await expect.poll(async () => restore(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY), 1)?.credits ?? -1, { timeout: 20_000 }).toBe(0);
  await page.reload();
  await settled(page);
  await expect.poll(() => counter(page, 'credits'), { timeout: 15_000 }).toBe(1234);
  expect(await bankBalance(page)).toBe(1234);

  // Even with the old save put back as it was and the bank gone (as when a guest's bank becomes an account's), the old
  // purse is not moved in a second time: the next guest's bank is a new member's.
  const session = createSession(5, { balls: 0 });
  session.credits = 1234;
  await page.evaluate(
    ([machineKey, bankKey, text]) => {
      window.localStorage.setItem(machineKey, text);
      window.localStorage.removeItem(bankKey);
    },
    [STORAGE_KEY, BANK_KEY, serialize(session)],
  );
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME));
  expect(await bankBalance(page)).toBe(WELCOME);
});

test('the hub and the machine in two tabs share one bank: a bonus taken at the hub reaches the machine once', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openPusher(page);
  await feedOne(page);
  const hub = await context.newPage();
  await openCenter(hub);
  await expect(hub.getByTestId('pusher-bonus-take')).toBeVisible();
  await hub.getByTestId('pusher-bonus-take').click();
  await expect(hub.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  await expect(hub.getByTestId('center-announcement')).toContainText(`Daily bonus: ${BONUS_CARD[0]} medals`);
  // One bank, with the bonus in it once, and the machine shows it as soon as it is played again.
  await page.bringToFront();
  await expect(async () => {
    const [played, won, credits, bank] = [await counter(page, 'played'), await counter(page, 'won'), await counter(page, 'credits'), await bankBalance(page)];
    expect(bank).toBe(START_CREDITS - played + won + BONUS_CARD[0]);
    expect(credits).toBe(bank);
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  await expect(page.getByTestId('pusher-bonus-take')).toHaveCount(0);
  // The machine plays on from the bank after the hub has had the card.
  await feedOne(page);
  await expect(async () => {
    const [played, won, bank] = [await counter(page, 'played'), await counter(page, 'won'), await bankBalance(page)];
    expect(bank).toBe(START_CREDITS - played + won + BONUS_CARD[0]);
  }).toPass({ timeout: 10_000 });
});

test('two machines in two tabs: the one played last has the medals, the other waits, and pressing it brings them back', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openPusher(page);
  await feedOne(page);
  const other = await context.newPage();
  await openPusher(other);
  // The first tab's machine waits, and says why, with a button to play it there again.
  await expect(machine(page).getByTestId('pusher-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(machine(page).getByTestId('pusher-play-here')).toHaveText('Play here');
  // The second plays from the same bank: it shows what the first left in it. And it plays the machine the first left:
  // it draws the one it found as it opened, and opens the first's once it has the card, which can be a moment later
  // (WebKit). A medal fed is counted on that machine only after that. A medal the first left on the field can still pay
  // on the second as it plays on, so the two are read together each time, never the bank once before the wait.
  await expect.poll(async () => (await counter(other, 'credits')) - (await bankBalance(other)), { timeout: 15_000 }).toBe(0);
  await expect.poll(() => counter(other, 'played'), { timeout: 15_000 }).toBe(await counter(page, 'played'));
  await feedOne(other);
  // Back to the first: it has the card again, and the machine the second saved, and the second waits.
  await page.bringToFront();
  await machine(page).getByTestId('pusher-play-here').click();
  await expect(machine(page).getByTestId('pusher-card-away')).toHaveCount(0);
  await expect(machine(other).getByTestId('pusher-card-away')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  await feedOne(page);
  await expect(async () => {
    const [played, won, bank] = [await counter(page, 'played'), await counter(page, 'won'), await bankBalance(page)];
    expect(bank).toBe(START_CREDITS - played + won);
  }).toPass({ timeout: 10_000 });
});
