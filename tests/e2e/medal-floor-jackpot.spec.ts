import { test, expect, type Page } from '@playwright/test';

import { getFloorStrings } from '../../src/components/game/MedalCenter/floor/strings';
import { getStrings as getSlotStrings } from '../../src/components/game/SlotMachine/i18n';
import type { FloorJackpotView } from '../../src/lib/medalFloor/jackpot';
import { periodAt } from '../../src/lib/medalFloor/periods';
import type { FloorSummary } from '../../src/lib/medalFloor/types';
import { openCenter } from './medalCenterPage';
import { arrived } from './streamedPage';

// The floor jackpot: one pool for the whole floor, its LED counter on the medal center's front and over every machine,
// the line every Odds tab gains, and its last wins on the rankings page. The floor's API is faked here at the network
// layer and the live database is cut off, so the pages ask the API every 30 seconds; nothing reaches a real server.
// Winning it and its medals going into a signed-in player's medals need a real sign-in, and are covered by the unit
// tests (jackpotPayer.test.ts, medalFloorJackpot.test.ts) against the real bank and the real routes on fakes.

const NOW = Date.now();
const t = getFloorStrings('en');

function jackpot(amount: number, available = true): FloorJackpotView {
  return {
    now: NOW,
    available,
    amount: available ? amount : 0,
    seq: available ? 3 : 0,
    wins: available
      ? [
          { name: 'Lucky Cat', tag: '0001', game: 'roulette', medals: 4_321, at: NOW - 2 * 3_600_000 },
          { name: null, tag: '1234', game: 'slot-machine', medals: 2_050, at: NOW - 30 * 3_600_000 },
        ]
      : [],
  };
}

function emptyFloor(): FloorSummary {
  const day = periodAt('day', NOW);
  const week = periodAt('week', NOW);
  return {
    now: NOW,
    available: true,
    feed: [],
    day: { kind: 'day', key: day.key, start: day.start, end: day.end, won: [], best: {} },
    week: { kind: 'week', key: week.key, start: week.start, end: week.end, won: [], best: {} },
  };
}

/** The floor's API, faked: the floor jackpot as `answer` gives it, an empty floor, and the live database cut off. */
async function fakeFloor(page: Page, answer: () => FloorJackpotView): Promise<{ asked: () => number; claims: () => number }> {
  let asked = 0;
  let claims = 0;
  await page.routeWebSocket(/firebaseio\.com/, (socket) => socket.close());
  await page.route(/firebaseio\.com/, (route) => route.abort());
  await page.route(/\/api\/game\/medal-floor(\?|$)/, (route) => route.fulfill({ json: emptyFloor() }));
  await page.route(/\/api\/game\/medal-floor\/jackpot(\?|$)/, (route) => {
    asked += 1;
    return route.fulfill({ json: answer() });
  });
  await page.route(/\/api\/game\/medal-floor\/jackpot\/wins/, (route) => {
    claims += 1;
    return route.fulfill({ status: 401, json: { error: 'No authorization token provided' } });
  });
  return { asked: () => asked, claims: () => claims };
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the medal center’s front shows the floor jackpot, its last win, and how a guest takes part, at a phone’s width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const floor = await fakeFloor(page, () => jackpot(3_214));
  await openCenter(page);
  const panel = page.getByTestId('floor-jackpot');
  await expect(panel.getByTestId('floor-jackpot-amount')).toContainText('FLOOR JACKPOT');
  await expect(panel.getByTestId('floor-jackpot-amount')).toHaveAttribute('data-amount', '3214');
  await expect(panel.getByTestId('floor-jackpot-amount')).toContainText('3,214');
  await expect(panel.getByTestId('jackpot-last')).toHaveText('Last won by Lucky Cat: 4,321 medals, 2 h ago');
  await expect(panel.getByTestId('jackpot-join')).toHaveAttribute('data-standing', 'guest');
  await expect(panel.getByTestId('jackpot-sign-in')).toHaveText(t.jackpotGuest);
  await expect(panel.getByTestId('jackpot-sign-in')).toHaveAttribute('href', /\/signin\?redirect=/);
  await expect(page.getByTestId('jackpot-honesty')).toHaveText(t.jackpotHonesty);
  await expect(panel.getByTestId('jackpot-linked')).toHaveText('Linked machines: Medal Pusher, Slot Machine, Calico Janken, Roulette & Martingale, Three Card Poker.');
  // Over the moments on show.
  const order = await page.evaluate(() => {
    const at = (id: string) => [...document.querySelectorAll('[data-testid]')].findIndex((el) => el.getAttribute('data-testid') === id);
    return [at('floor-jackpot'), at('floor-feed-empty')];
  });
  expect(order[0]).toBeLessThan(order[1]);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
  // A guest has nothing to be paid: nothing is asked for.
  expect(floor.claims()).toBe(0);
  expect(errors).toEqual([]);
});

test('the floor jackpot grows on the page without reloading it', async ({ page }) => {
  await page.clock.install();
  let amount = 1_000;
  const floor = await fakeFloor(page, () => jackpot(amount));
  await openCenter(page);
  const counter = page.getByTestId('floor-jackpot-amount');
  await expect(counter).toHaveAttribute('data-amount', '1000');
  const before = floor.asked();
  amount = 1_250;
  await page.clock.fastForward(31_000);
  await expect(counter).toHaveAttribute('data-amount', '1250');
  expect(floor.asked()).toBeGreaterThan(before);
});

test('reads in Japanese, with no money words', async ({ page }) => {
  const ja = getFloorStrings('ja');
  await fakeFloor(page, () => jackpot(3_214));
  await openCenter(page, 'ja');
  const panel = page.getByTestId('floor-jackpot');
  await expect(panel.getByTestId('floor-jackpot-amount')).toContainText('フロアジャックポット');
  await expect(panel.getByTestId('floor-jackpot-amount')).toContainText('枚');
  await expect(panel.getByTestId('jackpot-last')).toContainText('前回の当たり：Lucky Cat・4,321枚');
  await expect(panel.getByTestId('jackpot-sign-in')).toHaveText(ja.jackpotGuest);
  const text = (await panel.textContent()) ?? '';
  expect(text).not.toMatch(/預け|預かり|引き出し|残高|お金|賞金|現金|換金/);
});

test('a floor jackpot that cannot be reached shows dashes and says so, and the medal center works as before', async ({ page }) => {
  await fakeFloor(page, () => jackpot(0, false));
  await openCenter(page);
  await expect(page.getByTestId('floor-jackpot-amount')).toContainText('– – – –');
  await expect(page.getByTestId('floor-jackpot')).toContainText(t.jackpotUnavailable);
  await expect(page.getByTestId('center-balance')).not.toHaveText('—');
});

test('every machine shows the floor jackpot over it; a linked one’s Odds tab says what it adds on top, and a table that is not linked says play there takes no part', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const floor = await fakeFloor(page, () => jackpot(2_718));
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  for (const [path, linked] of [
    ['/games/slot-machine', true],
    ['/games/video-poker', false],
    ['/games/medal-pusher', true],
  ] as const) {
    expect((await page.goto(path))?.status()).toBe(200);
    await arrived(page);
    const strip = page.getByTestId('floor-jackpot-strip');
    await expect(strip, path).toHaveAttribute('data-linked', String(linked));
    await expect(strip.getByTestId('floor-jackpot-strip-amount'), path).toHaveAttribute('data-amount', '2718');
    await expect(strip.getByTestId('floor-jackpot-strip-amount'), path).toContainText('2,718');
    if (linked) {
      // A guest is shown the way to sign in and join the floor.
      await expect(strip.getByTestId('jackpot-join'), path).toHaveAttribute('data-standing', 'guest');
      await expect(strip.getByTestId('jackpot-sign-in'), path).toHaveText(t.jackpotGuest);
    } else {
      // A table that is not linked says plainly that play there neither feeds the floor jackpot nor wins it.
      await expect(strip.getByTestId('jackpot-not-linked'), path).toHaveText(t.jackpotNotLinked);
      await expect(strip.getByTestId('jackpot-join'), path).toHaveCount(0);
    }
    expect(await sideways(page), path).toBeLessThanOrEqual(0);
  }
  // The slot machine's Odds tab: its own return as before, and the floor jackpot's line under it.
  expect((await page.goto('/games/slot-machine'))?.status()).toBe(200);
  await arrived(page);
  const slot = getSlotStrings('en');
  await page.getByRole('tab', { name: slot.tabOdds }).click();
  await expect(page.getByTestId('slot-rtp')).toHaveText('95.262%');
  const note = page.getByTestId('floor-jackpot-odds');
  await expect(note).toBeVisible();
  await expect(note).toContainText('+ 1% of every medal played goes to the floor jackpot');
  await expect(note).toContainText('1 in 150,000');
  await expect(note).toContainText('1.67 medals for every 100 played');
  expect(floor.claims()).toBe(0);
  expect(errors).toEqual([]);
});

test('the rankings page lists the last floor jackpots, with no owner’s controls for anybody else', async ({ page }) => {
  await fakeFloor(page, () => jackpot(3_214));
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/medal-center/rankings'))?.status()).toBe(200);
  await arrived(page);
  const section = page.getByTestId('rankings-jackpot');
  await expect(section.getByTestId('rankings-jackpot-amount')).toHaveAttribute('data-amount', '3214');
  const wins = section.getByTestId('jackpot-win');
  await expect(wins).toHaveCount(2);
  await expect(wins.nth(0)).toContainText('Lucky Cat hit the FLOOR JACKPOT: 4,321 medals');
  await expect(wins.nth(0)).toContainText('Roulette');
  await expect(wins.nth(1)).toContainText('Player 1234');
  await expect(section.getByTestId('jackpot-void')).toHaveCount(0);
});
