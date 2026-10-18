import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';

import { MEDAL_RANKINGS_PATH } from '../../src/components/game/MedalCenter/floor/paths';
import { MEDAL_CENTER_PATH, MY_PAGE_PATH, machinePath } from '../../src/components/game/MedalCenter/paths';
import { FLOOR_GAMES } from '../../src/lib/medalFloor/games';
import type { FloorJackpotView } from '../../src/lib/medalFloor/jackpot';
import { periodAt } from '../../src/lib/medalFloor/periods';
import type { FloorRow, FloorSummary } from '../../src/lib/medalFloor/types';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// The medal floor's accessibility, checked the way a screen reader and a keyboard meet it. Every page of the medal
// center (its front, My Page, the rankings) and every machine on the floor (FLOOR_GAMES: a machine added there is
// checked here with nothing more to do) is run through axe-core on every tab, at a phone's width in the light theme
// in Japanese (the longest lines on the narrowest screen) and at a desk's in the dark theme in English; on the phone
// each tab's simulation is run too, for the tables it draws. The audit behind it ran all eight combinations of width,
// theme and language; two looks, each width, theme and language once, keep this inside the E2E job's time. axe-core is the copy the lint rules already install (eslint-plugin-jsx-a11y depends on it); nothing is added
// for this. The floor's API is faked at the network layer and the live database is cut off, as in
// medal-floor-jackpot.spec.ts: nothing reaches a real server.
//
// What fails: every violation axe calls serious or critical, and the structural rules below, which every page passes
// now. No rule is turned off. Text axe cannot judge (over gradients, felt, LED glass) it reports as "needs review",
// not as a violation, and that is left to the eye: see the contrast PR (#931) for how it was measured.

/** Moderate and minor rules that fail here all the same: every page passes them, and a new page should too. */
const STRUCTURE = ['landmark-one-main', 'page-has-heading-one', 'heading-order', 'empty-table-header'];

const NOW = Date.now();
const row = (rank: number, name: string | null, score: number, tag = '0042'): FloorRow => ({ rank, name, tag, score, at: NOW - 60_000 });

/** A floor with something on every board, so the rankings' boards and the feed are drawn and checked. */
function floor(): FloorSummary {
  const day = periodAt('day', NOW);
  const week = periodAt('week', NOW);
  return {
    now: NOW,
    available: true,
    feed: [
      { id: 2, name: 'Lucky Cat', tag: '1002', game: 'medal-pusher', label: 'jackpot', medals: 523, at: NOW - 30_000 },
      { id: 1, name: null, tag: '1001', game: 'slot-machine', label: 'seven3', medals: 3_000, at: NOW - 240_000 },
    ],
    day: { kind: 'day', key: day.key, start: day.start, end: day.end, won: [row(1, 'Lucky Cat', 12_480), row(2, null, 3_400, '1234')], best: { 'medal-pusher': [row(1, 'Lucky Cat', 523)] } },
    week: { kind: 'week', key: week.key, start: week.start, end: week.end, won: [row(1, 'Night Owl', 88_000)], best: { roulette: [row(1, 'Night Owl', 3_564)] } },
  };
}

const jackpot = (): FloorJackpotView => ({
  now: NOW,
  available: true,
  amount: 3_214,
  seq: 3,
  v: 42,
  wins: [{ name: 'Lucky Cat', tag: '0001', game: 'roulette', medals: 4_321, at: NOW - 2 * 3_600_000 }],
});

/** The floor's API, faked, and the live database cut off. A guest asks nothing else of a server. */
async function fakeFloor(page: Page): Promise<void> {
  await page.routeWebSocket(/firebaseio\.com/, (socket) => socket.close());
  await page.route(/firebaseio\.com/, (route) => route.abort());
  await page.route(/\/api\/game\/medal-floor(\?|$)/, (route) => route.fulfill({ json: floor() }));
  await page.route(/\/api\/game\/medal-floor\/jackpot(\?|$)/, (route) => route.fulfill({ json: jackpot() }));
  await page.route(/\/api\/game\/medal-floor\/jackpot\/wins/, (route) => route.fulfill({ status: 401, json: { error: 'No authorization token provided' } }));
}

interface Found {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

/** axe-core over the page as it stands. The development server's own overlay is not the page's. */
async function violations(page: Page): Promise<Found[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: axe.source });
  const found = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: typeof axe }).axe.run({ exclude: [['nextjs-portal']] }, { resultTypes: ['violations'] });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact ?? '', help: v.help, nodes: v.nodes.map((n) => `${n.target.join(' ')}  ${n.html.slice(0, 160)}`) }));
  });
  return found.filter((v) => v.impact === 'serious' || v.impact === 'critical' || STRUCTURE.includes(v.id));
}

/** A simulation's button, in either language. */
const RUN = /^(Run( simulation)?|Play them|Try( it)?|実行|シミュレーション実行|試す|遊ぶ)$/;
const RUNNING = /Running…|Playing…|実行中|試しています|遊んでいます/;

/**
 * Runs every simulation shown, and gives it up to 10 seconds to finish. One that takes longer (the Medal Pusher
 * measures its field, which takes a slow machine half a minute) is checked as it stands, running: what is on the
 * page then is what a player sees then.
 */
async function runSimulations(page: Page): Promise<void> {
  const buttons = page.getByRole('button', { name: RUN });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if ((await button.isVisible()) && (await button.isEnabled())) await button.click();
  }
  if (count === 0) return;
  const until = Date.now() + 10_000;
  while (Date.now() < until && RUNNING.test(await page.locator('body').innerText())) await page.waitForTimeout(250);
}

/**
 * Waits until every box that scrolls, and holds nothing Tab reaches, can be reached by Tab itself, as ScrollArea makes
 * it. A tab's panel is hidden until its tab is chosen, so a ScrollArea in it first measures nothing; it learns that it
 * scrolls from its next resize, a frame or two after the panel shows, and Firefox's axe could look in between. If a
 * box never becomes reachable, the wait ends and axe reports it as before.
 */
async function scrollAreasSettled(page: Page): Promise<void> {
  await page
    .waitForFunction(
      (focusable) =>
        [...document.querySelectorAll<HTMLElement>('body *')].every((element) => {
          const style = getComputedStyle(element);
          const scrolls =
            (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1) ||
            (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1);
          if (!scrolls || element.getClientRects().length === 0) return true;
          return element.tabIndex >= 0 || element.querySelector(focusable) !== null;
        }),
      'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
      { timeout: 3_000 },
    )
    .catch(() => undefined);
}

const PAGES = [MEDAL_CENTER_PATH, MY_PAGE_PATH, MEDAL_RANKINGS_PATH, ...FLOOR_GAMES.map(machinePath)];

/** Each width, theme and language once. */
const LOOKS = [
  { width: 375, height: 812, theme: 'light', language: 'ja' },
  { width: 1280, height: 900, theme: 'dark', language: 'en' },
] as const;

test.describe.configure({ mode: 'parallel' });

for (const look of LOOKS) {
  test.describe(`${look.width}px, ${look.theme}, ${look.language}`, () => {
    test.use({ viewport: { width: look.width, height: look.height }, colorScheme: look.theme });

    for (const path of PAGES) {
      test(`${path} has no serious accessibility problem on any tab`, async ({ page }) => {
        test.setTimeout(120_000);
        await fakeFloor(page);
        await page.context().addCookies([{ name: 'i18nextLng', value: look.language, url: 'http://localhost:3000' }]);
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await arrived(page);
        await page.waitForLoadState('networkidle');

        const problems: string[] = [];
        const check = async (view: string) => {
          await scrollAreasSettled(page);
          for (const v of await violations(page)) problems.push(`[${view}] ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.join('\n    ')}`);
        };
        await check('first view');

        const tabs = page.getByRole('tab');
        const count = await tabs.count();
        for (let i = 0; i < count; i++) {
          const tab = tabs.nth(i);
          if (!(await tab.isVisible()) || (await tab.getAttribute('aria-selected')) === 'true') continue;
          const name = ((await tab.textContent()) ?? '').trim();
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await check(`${name} tab`);
          if (look.width < 500) {
            await runSimulations(page);
            await check(`${name} tab, simulated`);
          }
        }
        expect(problems, problems.join('\n')).toEqual([]);
      });
    }
  });
}

test('How to play keeps the keyboard in it: focus goes in, Tab stays in, Escape closes it and gives focus back', async ({ page }) => {
  await fakeFloor(page);
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await page.goto(machinePath('slot-machine'));
  await arrived(page);
  const opener = page.getByRole('button', { name: 'How to play' });
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await pressUntil(opener, () => dialog.isVisible());
  await expect(dialog.getByRole('button', { name: /close/i })).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a big win is said once while its medals count up, and the counting meters are not read out', async ({ page }) => {
  await fakeFloor(page);
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await page.goto(machinePath('slot-machine'));
  await arrived(page);
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true', { timeout: 20_000 });

  // The meters that count a win up are not inside anything that is read out as it changes.
  const live = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="marquee"], [role="timer"]';
  for (const meter of ['slot-medals', 'slot-medals-led', 'slot-win', 'slot-win-led']) {
    expect(await page.getByTestId(meter).evaluate((element, selector) => element.closest(selector) === null, live), meter).toBe(true);
  }

  // Everything any live region says from the press until the meters have counted the win in.
  await page.evaluate((selector) => {
    const said: string[] = [];
    const last = new Map<Element, string>();
    new MutationObserver((records) => {
      const touched = new Set<Element>();
      for (const record of records) {
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        const region = element?.closest(selector);
        if (region) touched.add(region);
      }
      for (const region of touched) {
        const text = (region.textContent ?? '').trim();
        if (text && text !== last.get(region)) said.push(text);
        last.set(region, text);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    (window as unknown as { __said: string[] }).__said = said;
  }, live);

  // The reels land on 7-7-7: virtual stop 0 of every reel is its 7.
  await rigPresses(page, [0.001, 0.001, 0.001]);
  const spin = page.getByRole('button', { name: 'SPIN', exact: true });
  await expect(spin).toBeEnabled({ timeout: 20_000 });
  const reels = page.locator('[role="img"][data-spinning]');
  await pressUntil(spin, async () => (await reels.getAttribute('data-spinning')) === 'true');
  await expect(page.getByTestId('slot-result')).toContainText('Three 7s', { timeout: 20_000 });
  // The win runs into the meters for up to 2.4 s: wait until it has.
  await expect.poll(async () => (await page.getByTestId('slot-medals-led').getAttribute('data-shown')) === (await page.getByTestId('slot-medals').textContent())?.replace(/,/g, ''), { timeout: 10_000 }).toBe(true);

  const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said);
  expect(said.filter((text) => text.includes('Three 7s'))).toHaveLength(1);
  expect(said.length, said.join(' | ')).toBeLessThanOrEqual(3);
});
