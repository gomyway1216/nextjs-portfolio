import { test, expect, type Page } from '@playwright/test';

import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { createHistory, mergeHistories, parseHistory, record, recordsOf, serializeHistory, totalsOf, type History, type Observation } from '../../src/components/game/MedalCenter/history';
import { HISTORY_KEY, partKey } from '../../src/components/game/MedalCenter/historyStore';
import { WELCOME, createLedger, give, serializeLedger } from '../../src/components/game/MedalCenter/ledger';
import { MY_PAGE_PATH } from '../../src/components/game/MedalCenter/paths';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { bankBalance, openCenter, resetAtCenter } from './medalCenterPage';
import { onPageError } from './pageErrors';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';
import { quietFloor } from './quietFloor';

// The floor's API answers at once (quietFloor.ts): its 6 s waits on CI hold up navigation from the hub to a machine.
test.beforeEach(async ({ context }) => quietFloor(context));

// The medal center's "my page" for a guest: the history of what happened to the medals after playing two machines,
// which a reload keeps and the medal center's reset shows in, and the page at a phone's width in both languages.
// Each machine is played the way its own spec plays it; the draws are set so that the medals come out as written.

/** The medals' history this browser keeps for a guest, read the way the page reads it: the whole and the part changed since, joined. */
async function storedHistory(page: Page): Promise<History | null> {
  const [whole, part] = await page.evaluate((keys) => keys.map((key) => window.localStorage.getItem(key)), [HISTORY_KEY, partKey(HISTORY_KEY)]);
  const [one, other] = [parseHistory(whole), parseHistory(part)];
  return one && other ? mergeHistories(one, other) : (one ?? other);
}

/** The my page: opened, arrived, and the medals and their history read. */
async function openMyPage(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto(MY_PAGE_PATH);
  expect(response?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByTestId('mypage-counter')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('mypage-history')).toHaveAttribute('data-loaded', 'true');
}

const entries = (page: Page) => page.getByTestId('mypage-entry');
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

/** One spin of the slot machine at one medal, the draw set to 7-7-7: it pays 1,000. */
async function spinSevens(page: Page) {
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/slot-machine'))?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true', { timeout: 20_000 });
  const spin = page.getByRole('button', { name: 'SPIN', exact: true });
  await expect(spin).toBeEnabled({ timeout: 20_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => 0.001;
  });
  await spin.click();
  await page.evaluate(() => {
    Math.random = (window as unknown as { __random: () => number }).__random;
  });
  await expect(page.locator('[role="img"][data-spinning]')).toHaveAttribute('data-spinning', 'false', { timeout: 15_000 });
  await expect(page.getByTestId('slot-win')).toHaveText('1000');
}

const RANKS = '23456789TJQKA';
const card = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);
/** A full house dealt, and the five cards a draw would bring: held whole, at five medals it pays 45. */
const FULL_HOUSE = ['K♠', 'K♥', '7♦', '7♣', '7♠', '2♠', '3♥', '4♦', '5♣', '9♠'];

/** One hand of video poker at five medals, dealt a full house and held whole: it pays 45. */
async function fullHouse(page: Page) {
  expect((await page.goto('/games/video-poker'))?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByTestId('vp-medals')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 15_000 });
  // The deal's random numbers, set just before DEAL: the ones the deal turns into exactly these ten cards.
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const queue: number[] = [];
  FULL_HOUSE.map(card).forEach((wanted, i) => {
    const j = deck.indexOf(wanted);
    queue.push((j - i + 0.5) / (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  });
  // Served only to the press that deals: the live site's other callers of Math.random do not take them.
  await rigPresses(page, queue);
  await page.getByRole('button', { name: 'DEAL', exact: true }).click();
  const draw = page.getByRole('button', { name: 'DRAW', exact: true });
  await expect(draw).toBeVisible();
  for (let i = 0; i < 5; i++) {
    const slot = page.locator(`[data-slot="${i}"]`);
    if ((await slot.getAttribute('aria-pressed')) !== 'true') await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
  }
  await draw.click();
  await expect(page.getByTestId('vp-win')).toHaveText('45');
}

test('lists what happened to a guest’s medals at two machines, keeps it through a reload, and shows the medal center’s reset in it', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  await spinSevens(page);
  await fullHouse(page);
  const medals = WELCOME - 1 + 1000 - 5 + 45;
  await expect.poll(() => bankBalance(page)).toBe(medals);

  // The front of the medal center has the way in.
  await openCenter(page);
  await expect(page.getByTestId('center-my-page')).toHaveAttribute('href', MY_PAGE_PATH);
  await page.getByTestId('center-my-page').click();
  await expect(page).toHaveURL(new RegExp(`${MY_PAGE_PATH}$`));
  await arrived(page);
  await expect(page.getByTestId('mypage-history')).toHaveAttribute('data-loaded', 'true');

  // The latest first: the hand of video poker, then the spin. Each says what it took and what came back.
  await expect(entries(page)).toHaveCount(2);
  await expect(entries(page).nth(0)).toHaveAttribute('data-game', 'video-poker');
  await expect(entries(page).nth(0)).toContainText('Bet 5 · won 45');
  await expect(entries(page).nth(0)).toContainText('40 medals up');
  await expect(entries(page).nth(1)).toHaveAttribute('data-game', 'slot-machine');
  await expect(entries(page).nth(1)).toContainText('Bet 1 · won 1,000');
  await expect(page.getByTestId('mypage-medals')).toHaveText(medals.toLocaleString('en-US'));
  // The records, every machine's added up, and each machine's.
  await expect(page.getByTestId('mypage-total-rounds')).toHaveText('2');
  await expect(page.getByTestId('mypage-total-bet')).toHaveText('6');
  await expect(page.getByTestId('mypage-total-won')).toHaveText('1,045');
  await expect(page.getByTestId('mypage-slot-machine-top')).toHaveText('1,000');
  await expect(page.getByTestId('mypage-video-poker-best')).toHaveText('1 round won in a row');
  await expect(page.getByTestId('mypage-game-roulette')).toHaveAttribute('data-played', 'false');
  // It says where the history begins, and that play from before is not in it; and where it is kept.
  await expect(page.getByTestId('mypage-since')).toContainText('What was played before then is not in it.');
  await expect(page.getByTestId('mypage-where')).toHaveAttribute('data-where', 'device');
  await expect(page.getByTestId('mypage-sign-in')).toBeVisible();
  await expect(page.getByTestId('mypage-chart')).toBeVisible();
  // What the history says went in and came back is what the medals did.
  const kept = await storedHistory(page);
  expect(kept && totalsOf(recordsOf(kept))).toEqual({ rounds: 2, bet: 6, won: 1045 });
  expect(WELCOME - 6 + 1045).toBe(medals);

  // A reload keeps it all.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('mypage-history')).toHaveAttribute('data-loaded', 'true');
  await expect(entries(page)).toHaveCount(2);
  await expect(page.getByTestId('mypage-total-won')).toHaveText('1,045');

  // The one reset, at the medal center: it is in the history, with what it threw away, and the records stay.
  await resetAtCenter(page);
  await openMyPage(page);
  await expect(entries(page)).toHaveCount(3);
  await expect(entries(page).nth(0)).toHaveAttribute('data-kind', 'reset');
  await expect(entries(page).nth(0)).toContainText(`Medals reset: ${medals.toLocaleString('en-US')} thrown away, started again with ${WELCOME}`);
  await expect(page.getByTestId('mypage-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('mypage-total-rounds')).toHaveText('2');
  expect(errors).toEqual([]);
});

test('fits a phone’s width in both languages, says the medals are not money, and invites a guest to sign in', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  await fullHouse(page);
  await openMyPage(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('My Page');
  await expect(page.getByTestId('mypage-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('mypage-member')).toHaveText('Guest');
  await expect(page.getByTestId('mypage-sign-in')).toHaveAttribute('href', `/signin?redirect=${encodeURIComponent(MY_PAGE_PATH)}`);
  await expect(entries(page)).toHaveCount(1);
  expect(await sideways(page)).toBeLessThanOrEqual(375);

  await openMyPage(page, 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('マイページ');
  await expect(page.getByTestId('mypage-not-money')).toHaveText(NOT_MONEY.ja);
  await expect(page.locator('#mypage-counter-label')).toHaveText('持ちメダル');
  await expect(entries(page).nth(0)).toContainText('ベット5枚・獲得45枚');
  await expect(page.getByTestId('mypage-records')).toContainText('ビデオポーカー');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  // The medal center's front names the way in, in Japanese too.
  await openCenter(page, 'ja');
  await expect(page.getByTestId('center-my-page')).toContainText('マイページ');
  expect(errors).toEqual([]);
});

/** A guest's history after a couple of months on this device and two others: 300 rounds of seven machines. */
function twoMonths(): History {
  const machines = ['slot-machine', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'three-card-poker', 'janken'];
  const from = Date.UTC(2026, 7, 1);
  const copies = ['k3j2h1g0f9', 'p9q8r7s6t5', 'a1b2c3d4e5'].map((device) => createHistory(device, from));
  for (let i = 0; i < 300; i++) {
    const game = machines[i % machines.length];
    const round = `${(1_760_700_000_000 + i * 977).toString(36)}${(i * 7919).toString(36).padStart(4, '0')}`;
    const moment = from + i * 4 * 3_600_000;
    const day = new Date(moment).toISOString().slice(0, 10) as Observation['day'];
    copies[i % 3] = record(copies[i % 3], { type: 'move', game, round, step: 'stake', medals: -(1 + (i % 9)), at: moment, day, left: 1000 });
    copies[i % 3] = record(copies[i % 3], { type: 'move', game, round, step: 'pay', medals: (i * 37) % 23, at: moment + 1000, day, left: 1000 + ((i * 131) % 4000) });
  }
  return copies.reduce((joined, copy) => mergeHistories(joined, copy));
}

test('while a machine plays, writes only the part of the history its rounds changed, and the whole as the page is left', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // A guest with two months of history, and medals enough to play on with.
  const kept = serializeHistory(twoMonths());
  const before = totalsOf(recordsOf(parseHistory(kept)!));
  expect(before.rounds).toBe(300);
  await page.addInitScript(
    ([historyKey, history, bankKey, bank]) => {
      if (window.localStorage.getItem(historyKey) === null) window.localStorage.setItem(historyKey, history);
      if (window.localStorage.getItem(bankKey) === null) window.localStorage.setItem(bankKey, bank);
      // Every write that changes what storage holds is noted: where, and how long.
      const w = window as unknown as { __writes: { key: string; size: number }[] };
      w.__writes = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
        if (this.getItem(key) !== value) w.__writes.push({ key, size: value.length });
        return set.call(this, key, value);
      };
    },
    [HISTORY_KEY, kept, BANK_KEY, serializeLedger(give(createLedger('testdevice01'), 10_000))],
  );
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/video-poker'))?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 15_000 });
  const deal = page.getByRole('button', { name: 'DEAL', exact: true });
  const draw = page.getByRole('button', { name: 'DRAW', exact: true });
  await pressUntil(deal, () => draw.isVisible());
  await draw.click();
  await page.evaluate(() => {
    (window as unknown as { __writes: unknown[] }).__writes = [];
  });
  // Twenty seconds of steady play: a hand dealt and drawn every second or two.
  let hands = 1;
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    await expect(deal).toBeEnabled();
    await deal.click();
    await expect(draw).toBeVisible();
    await draw.click();
    hands += 1;
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(2_500);
  const writes = await page.evaluate(() => (window as unknown as { __writes: { key: string; size: number }[] }).__writes);
  const whole = writes.filter((w) => w.key === HISTORY_KEY);
  const part = writes.filter((w) => w.key === partKey(HISTORY_KEY));
  // The whole, some 50,000 characters, is not written while the machine plays: before, it was every two seconds.
  expect(whole).toEqual([]);
  // The part every couple of seconds at the most, each a small fraction of the whole, and all of them together less than one whole.
  expect(part.length).toBeGreaterThan(0);
  expect(part.length).toBeLessThanOrEqual(12);
  expect(Math.max(...part.map((w) => w.size)) * 5).toBeLessThan(kept.length);
  expect(part.reduce((sum, w) => sum + w.size, 0)).toBeLessThan(kept.length);
  // Every hand is in the history as it is kept, the whole and the part joined.
  expect(totalsOf(recordsOf((await storedHistory(page))!)).rounds).toBe(before.rounds + hands);

  // The page is left for the my page: the history is written whole as it goes, and the part let go of.
  await openMyPage(page);
  await expect(page.getByTestId('mypage-total-rounds')).toHaveText(String(before.rounds + hands));
  const [wholeText, partText] = await page.evaluate((keys) => keys.map((key) => window.localStorage.getItem(key)), [HISTORY_KEY, partKey(HISTORY_KEY)]);
  expect(partText).toBeNull();
  expect(totalsOf(recordsOf(parseHistory(wholeText)!)).rounds).toBe(before.rounds + hands);
});

test('a floor jackpot is an entry of its own, with records apart from the machines’, at a phone’s width', async ({ page }) => {
  // Winning one needs a signed-in player (the unit tests pay one into the medals through the real routes on fakes). Here
  // the history this browser keeps already has one, as the bank writes it once the medals are in, and the page reads it.
  await page.setViewportSize({ width: 375, height: 812 });
  const from = Date.now() - 3_600_000;
  const day = new Date(from).toISOString().slice(0, 10) as Observation['day'];
  const steps: Observation[] = [
    { type: 'move', game: 'slot-machine', round: 'reel0001', step: 'stake', medals: -3, at: from, day, left: WELCOME - 3 },
    { type: 'move', game: 'slot-machine', round: 'reel0001', step: 'pay', medals: 6, at: from + 1_000, day, left: WELCOME + 3 },
    { type: 'floor', id: '20261017-a1b2c3d4', medals: 2_431, at: from + 2_000, day, left: WELCOME + 3 + 2_431 },
  ];
  const kept = serializeHistory(steps.reduce(record, createHistory('testdevice01', from - 60_000)));
  await page.addInitScript(
    ([historyKey, history, bankKey, bank]) => {
      if (window.localStorage.getItem(historyKey) === null) window.localStorage.setItem(historyKey, history);
      if (window.localStorage.getItem(bankKey) === null) window.localStorage.setItem(bankKey, bank);
    },
    [HISTORY_KEY, kept, BANK_KEY, serializeLedger(give(createLedger('testdevice01'), 3 + 2_431))],
  );
  await openMyPage(page);
  const floor = entries(page).and(page.locator('[data-kind="floor"]'));
  await expect(floor).toHaveCount(1);
  await expect(floor).toContainText('Medal floor');
  await expect(floor).toContainText('FLOOR JACKPOT +2,431');
  // Its records, apart from the machines': the machines' totals are what the slot machine did.
  await expect(page.getByTestId('mypage-floor-wins')).toHaveText('1');
  await expect(page.getByTestId('mypage-floor-biggest')).toHaveText('2,431');
  await expect(page.getByTestId('mypage-total-won')).toHaveText('6');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  // And in Japanese.
  await openMyPage(page, 'ja');
  await expect(entries(page).and(page.locator('[data-kind="floor"]'))).toContainText('フロアジャックポット +2,431枚');
});
