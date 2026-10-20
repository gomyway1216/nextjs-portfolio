import { test, expect, type Page, type Request } from '@playwright/test';

import { getFloorStrings } from '../../src/components/game/MedalCenter/floor/strings';
import { periodAt } from '../../src/lib/medalFloor/periods';
import type { FloorFeedEntry, FloorRow, FloorSummary } from '../../src/lib/medalFloor/types';
import { openCenter } from './medalCenterPage';
import { onPageError } from './pageErrors';
import { arrived } from './streamedPage';

// The medal floor played together: the big wins of everyone playing, live, and the day's and week's rankings, on the
// medal center's front and on its own rankings page. The floor's API is faked here at the network layer, and the live
// database is cut off, so the pages fall back to asking the API every 30 seconds; nothing reaches a real server. What
// a signed-in player sees (joining, a nickname, the owner's controls) needs a real sign-in and is covered by the unit
// tests instead.

const NOW = Date.now();
const t = getFloorStrings('en');

const moment = (id: number, game: FloorFeedEntry['game'], medals: number, label: string | null, name: string | null, secondsAgo: number): FloorFeedEntry => ({
  id,
  name,
  tag: String(1000 + id),
  game,
  label,
  medals,
  at: NOW - secondsAgo * 1000,
});
const row = (rank: number, name: string | null, score: number, tag = '0042'): FloorRow => ({ rank, name, tag, score, at: NOW - 60_000 });

function floor(feed: FloorFeedEntry[], available = true): FloorSummary {
  const day = periodAt('day', NOW);
  const week = periodAt('week', NOW);
  return {
    now: NOW,
    available,
    feed,
    day: {
      kind: 'day',
      key: day.key,
      start: day.start,
      end: day.end,
      won: available ? [row(1, 'Lucky Cat', 12_480), row(2, null, 3_400, '1234'), row(2, 'みけ', 3_400)] : [],
      best: available ? { 'medal-pusher': [row(1, 'Lucky Cat', 523)], 'slot-machine': [row(1, null, 3_000, '1234')], janken: [row(1, 'みけ', 160)] } : {},
    },
    week: {
      kind: 'week',
      key: week.key,
      start: week.start,
      end: week.end,
      won: available ? [row(1, 'Night Owl', 88_000), row(2, 'Lucky Cat', 12_480)] : [],
      best: available ? { roulette: [row(1, 'Night Owl', 3_564), row(2, 'Lucky Cat', 360)] } : {},
    },
  };
}

const FEED = [
  moment(3, 'medal-pusher', 523, 'jackpot', 'Lucky Cat', 30),
  moment(2, 'slot-machine', 3_000, 'seven3', null, 240),
  moment(1, 'janken', 160, 'double-up', 'みけ', 4_000),
];

/** The floor's API, faked: whatever `answer` gives, for the hub and the rankings page alike. The live database is cut off. */
async function fakeFloor(page: Page, answer: () => FloorSummary): Promise<Request[]> {
  const asked: Request[] = [];
  await page.routeWebSocket(/firebaseio\.com/, (socket) => socket.close());
  await page.route(/firebaseio\.com/, (route) => route.abort());
  await page.route(/\/api\/game\/medal-floor(\?|$)/, (route) => {
    asked.push(route.request());
    return route.fulfill({ json: answer() });
  });
  return asked;
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** The board by the door: the floor jackpot and the latest big wins, over the machines. */
const board = (page: Page) => page.getByTestId('floor-now');
/** Further in, under the machines: the rankings and the player's place on the floor. */
const together = (page: Page) => page.getByTestId('floor-together');

test('the medal center’s front shows the big wins on the floor by the door and today’s rankings under the machines, at a phone’s width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  await fakeFloor(page, () => floor(FEED));
  await openCenter(page);
  // By the door, right after the medals and the daily bonus: over the machines, which are over the rankings.
  const top = async (id: string) => (await page.getByTestId(id).boundingBox())?.y ?? -1;
  expect(await top('center-bonus')).toBeLessThan(await top('floor-now'));
  expect(await top('floor-now')).toBeLessThan(await top('center-machines'));
  expect(await top('center-machines')).toBeLessThan(await top('floor-together'));
  const moments = board(page).getByTestId('floor-moment');
  await expect(moments).toHaveCount(3);
  await expect(moments.nth(0)).toContainText('Lucky Cat hit the JACKPOT: 523 medals');
  await expect(moments.nth(0)).toContainText('Medal Pusher');
  await expect(moments.nth(0)).toContainText('just now');
  await expect(moments.nth(1)).toContainText('Player 1002 lined up three sevens: 3,000 medals');
  await expect(moments.nth(1)).toContainText('4 min ago');
  await expect(moments.nth(2)).toContainText('みけ won a 160-medal double-up');
  // Cut off from the live database, it says it asks every 30 seconds; every win and ranking is a tap away.
  await expect(board(page).getByTestId('floor-live')).toHaveText(t.polling);
  await expect(board(page).getByTestId('floor-more-moments')).toHaveAttribute('href', '/games/medal-center/rankings');

  // Today's boards: medals won, with a shared rank, and the biggest win at each machine.
  const won = together(page).getByTestId('floor-won').getByTestId('floor-row');
  await expect(won).toHaveCount(3);
  await expect(won.nth(0)).toContainText('#1');
  await expect(won.nth(0)).toContainText('Lucky Cat');
  await expect(won.nth(0)).toContainText('12,480 medals');
  await expect(won.nth(1)).toHaveAttribute('data-rank', '2');
  await expect(won.nth(2)).toHaveAttribute('data-rank', '2');
  await expect(together(page).getByTestId('floor-best-row')).toHaveCount(3);
  await expect(together(page).getByTestId('floor-best-row').first()).toHaveAttribute('data-game', 'medal-pusher');

  // A guest is asked to sign in to join; the page says plainly what the rankings are.
  await expect(together(page).getByTestId('floor-place')).toHaveAttribute('data-state', 'guest');
  await expect(together(page).getByTestId('floor-sign-in')).toHaveAttribute('href', /\/signin\?redirect=/);
  await expect(together(page).getByTestId('floor-honesty')).toHaveText(t.honesty);
  await expect(together(page).getByTestId('floor-all-rankings')).toHaveAttribute('href', '/games/medal-center/rankings');

  expect(await sideways(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('this week’s boards are a tap away', async ({ page }) => {
  await fakeFloor(page, () => floor(FEED));
  await openCenter(page);
  const rankings = together(page).getByTestId('floor-rankings');
  await expect(rankings.getByTestId('floor-won').getByTestId('floor-row')).toHaveCount(3);
  await rankings.getByTestId('floor-period-week').click();
  await expect(rankings.getByTestId('floor-period-week')).toHaveAttribute('aria-pressed', 'true');
  await expect(rankings.getByTestId('floor-won').getByTestId('floor-row').first()).toContainText('Night Owl');
  await expect(rankings.getByTestId('floor-best-row')).toHaveCount(1);
  await expect(rankings.getByTestId('floor-best-row')).toContainText('Roulette');
});

test('a new big win comes onto the board by the door without reloading the page, and the oldest of the three goes', async ({ page }) => {
  await page.clock.install();
  let feed = FEED;
  const asked = await fakeFloor(page, () => floor(feed));
  await openCenter(page);
  await expect(board(page).getByTestId('floor-moment')).toHaveCount(3);
  const before = asked.length;
  feed = [moment(4, 'video-poker', 4_000, 'royal', 'Night Owl', 0), ...FEED];
  await page.clock.fastForward(31_000);
  await expect(board(page).getByTestId('floor-moment').first()).toContainText('Night Owl drew a royal flush: 4,000 medals');
  await expect(board(page).getByTestId('floor-moment')).toHaveCount(3);
  await expect(board(page)).not.toContainText('みけ');
  expect(asked.length).toBeGreaterThan(before);
});

test('reads in Japanese', async ({ page }) => {
  const ja = getFloorStrings('ja');
  let feed = FEED;
  await fakeFloor(page, () => floor(feed));
  await openCenter(page, 'ja');
  await expect(together(page).getByRole('heading', { level: 2 })).toHaveText(ja.title);
  await expect(board(page).getByRole('heading', { level: 2 })).toHaveText(ja.nowTitle);
  await expect(board(page).getByTestId('floor-moment').first()).toContainText('Lucky Cat ジャックポット！523枚');
  await expect(board(page).getByTestId('floor-moment').nth(1)).toContainText('プレイヤー1002');
  await expect(together(page).getByTestId('floor-won').getByTestId('floor-row').first()).toContainText('1位');
  await expect(together(page).getByTestId('floor-honesty')).toHaveText(ja.honesty);
  // The newest machines' named wins, on the rankings' feed: 「ゾロ目が的中」, never 「ゾロ目的中」 (「ゾロ・目的・中」).
  feed = [moment(9, 'sic-bo', 4_525, 'sicbo-triple', 'みけ', 30), moment(8, 'high-low', 2_000, 'ladder-top', null, 90)];
  await page.goto('/games/medal-center/rankings');
  await arrived(page);
  const moments = page.getByTestId('floor-moment');
  await expect(moments.first()).toContainText('みけ シックボーでゾロ目が的中！4,525枚');
  await expect(moments.nth(1)).toContainText('プレイヤー1008 ハイ＆ローのラダーをトップまで上って2,000枚');
});

test('the board by the door keeps its size while the floor is read: the machines under it do not move when the wins and the floor jackpot come in', async ({ page }) => {
  // Both of the floor's answers are held until the page has drawn the board without them, then let go at once.
  const held: (() => Promise<void>)[] = [];
  await page.routeWebSocket(/firebaseio\.com/, (socket) => socket.close());
  await page.route(/firebaseio\.com/, (route) => route.abort());
  await page.route(/\/api\/game\/medal-floor\/jackpot\/wins/, (route) => route.fulfill({ status: 401, json: { error: 'No authorization token provided' } }));
  await page.route(/\/api\/game\/medal-floor\/jackpot(\?|$)/, (route) => {
    held.push(() =>
      route.fulfill({ json: { now: NOW, available: true, amount: 3_214, seq: 3, v: 42, wins: [{ name: 'ABCDEFGHIJKL', tag: '0001', game: 'roulette', medals: 17_820, at: NOW - 2 * 3_600_000 }] } }),
    );
  });
  await page.route(/\/api\/game\/medal-floor(\?|$)/, (route) => {
    held.push(() => route.fulfill({ json: floor(FEED) }));
  });
  const place = () =>
    page.evaluate(() => ({
      machines: Math.round((document.querySelector('[data-testid="center-machines"]')?.getBoundingClientRect().top ?? 0) + window.scrollY),
      board: Math.round(document.querySelector('[data-testid="floor-now"]')?.getBoundingClientRect().height ?? 0),
    }));
  for (const width of [320, 375, 1280]) {
    held.length = 0;
    await page.setViewportSize({ width, height: 800 });
    await openCenter(page);
    await expect(board(page).getByTestId('floor-feed-empty')).toBeVisible();
    await expect.poll(() => held.length).toBe(2);
    const before = await place();
    await Promise.all(held.map((fulfill) => fulfill()));
    await expect(board(page).getByTestId('floor-moment')).toHaveCount(3);
    await expect(page.getByTestId('floor-jackpot-amount')).toHaveAttribute('data-amount', '3214');
    expect(await place(), `${width} px`).toEqual(before);
  }
});

test('a floor that cannot be reached says so, and the medal center works as before', async ({ page }) => {
  await fakeFloor(page, () => floor([], false));
  await openCenter(page);
  await expect(board(page).getByTestId('floor-feed-empty')).toHaveText(t.feedUnavailable);
  await expect(page.getByTestId('center-balance')).not.toHaveText('—');
  await expect(page.getByTestId('center-play-medal-pusher')).toBeVisible();
});

test('the rankings page has every machine’s board, today and this week, and the moments on show, at a phone’s width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  const asked = await fakeFloor(page, () => floor(FEED));
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/medal-center/rankings');
  expect(response?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('RANKINGS');
  await expect(page.getByTestId('rankings-won').getByTestId('floor-row')).toHaveCount(3);
  for (const game of ['medal-pusher', 'slot-machine', 'janken', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'craps', 'three-card-poker', 'fishing', 'horse-race', 'ball-bingo', 'big-wheel', 'high-low', 'sic-bo', 'sugoroku', 'coin-maze', 'keno', 'smart-ball']) {
    await expect(page.getByTestId(`rankings-best-${game}`)).toBeVisible();
  }
  await expect(page.getByTestId('rankings-best-slot-machine').getByTestId('floor-row')).toContainText('Player 1234');
  await expect(page.getByTestId('rankings-best-craps')).toContainText(t.boardEmpty);
  await expect(page.getByTestId('floor-moment')).toHaveCount(3);
  await expect(page.getByTestId('rankings-period-note')).toContainText('Japan time');
  // The full boards are asked for, not the hub's.
  expect(asked.some((request) => request.url().includes('view=full'))).toBe(true);
  await page.getByTestId('floor-period-week').click();
  await expect(page.getByTestId('rankings-best-roulette').getByTestId('floor-row')).toHaveCount(2);
  await expect(page.getByTestId('rankings-back')).toHaveAttribute('href', '/games/medal-center');
  // Nobody here is the owner: no owner's controls.
  await expect(page.getByTestId('floor-hide-line')).toHaveCount(0);
  await expect(page.getByTestId('floor-hide-moment')).toHaveCount(0);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('nothing about a guest’s play is sent to the floor, even a jackpot', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const sent: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/game\/medal-floor\/(me|report)/.test(request.url())) sent.push(request.url());
  });
  await fakeFloor(page, () => floor(FEED));
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await page.goto('/games/slot-machine');
  await arrived(page);
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true', { timeout: 20_000 });
  const spin = page.getByRole('button', { name: 'SPIN', exact: true });
  await expect(spin).toBeEnabled({ timeout: 20_000 });
  // The draw forced to 7-7-7 for one spin.
  await page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => 0.001;
  });
  await spin.click();
  await page.evaluate(() => {
    Math.random = (window as unknown as { __random: () => number }).__random;
  });
  await expect(page.getByTestId('slot-win')).toHaveText('1000', { timeout: 15_000 });
  // Leaving the page is when what is left would go.
  await page.goto('/games/medal-center');
  await arrived(page);
  await expect(page.getByTestId('center-balance')).not.toHaveText('—');
  expect(sent).toEqual([]);
});
