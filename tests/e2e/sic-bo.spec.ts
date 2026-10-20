import { test, expect, type Page } from './fixtures';

import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import type { BetId, Face } from '../../src/components/game/SicBo/engine';
import { TABLE_KEY, parseTable } from '../../src/components/game/SicBo/medalTable';
import { AXES, LABELS } from '../../src/components/game/SicBo/physics';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';
import { instantScroll } from './instantScroll';

// Moonlit Sic Bo plays with the medal center's medals. A roll is three numbers drawn from Math.random as SHAKE is
// pressed (engine.ts), one for each die: a test that needs a particular roll queues them for the press (rigPresses.ts),
// so nothing else on the page can take them first. The floor's API is faked (fixtures.ts).

test.beforeEach(async ({ context }) => {
  // The page scrolls at once, not smoothly, so that a press lands where it was aimed (instantScroll.ts).
  await instantScroll(context);
});

/** The numbers that make the dice fall on `faces`. */
const drawn = (...faces: Face[]): number[] => faces.map((face) => (face - 0.5) / 6);

const machine = (page: Page) => page.getByTestId('sb-machine');

async function openTable(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/sic-bo');
  expect(response?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const amountOn = async (page: Page, id: BetId) => Number(await page.getByTestId(`sb-area-${id}`).getAttribute('data-amount'));
const shownMedals = async (page: Page) => Number(((await page.getByTestId('sb-medals').textContent()) ?? '').replace(/,/g, ''));
const rolls = async (page: Page) => Number(await page.getByTestId('sb-stat-rolls').textContent());

/** Puts `taps` taps of the chosen size on an area, the first pressed again only while nothing has landed on it. */
async function bet(page: Page, id: BetId, taps = 1) {
  const area = page.getByTestId(`sb-area-${id}`);
  const before = await amountOn(page, id);
  await pressUntil(area, async () => (await amountOn(page, id)) > before);
  for (let i = 1; i < taps; i++) await area.click();
}

/** SHAKE, with the dice given drawn for it: pressed again only while no roll has begun, so never twice. */
async function shake(page: Page, numbers: number[]) {
  await rigPresses(page, numbers);
  const before = await rolls(page);
  await pressUntil(page.getByTestId('sb-shake'), async () => {
    const phase = await machine(page).getAttribute('data-phase');
    return phase === 'shake' || phase === 'settle' || (await rolls(page)) > before;
  });
}

/**
 * The faces the three dice in the dome show on top, read from their own transforms (a rotate3d of the cube): the face
 * whose outward side points most nearly up off the platter.
 */
const domeFaces = async (page: Page): Promise<number[]> => {
  const turns = await page.locator('[data-testid="sb-dome"] [data-die]').evaluateAll((dice) =>
    dice.map((die) => (die as HTMLElement).style.transform.match(/rotate3d\(([^)]+)\)/)![1].split(',').map((part) => parseFloat(part))),
  );
  return turns
    .map(([x, y, z, angle]) => {
      const n = Math.hypot(x, y, z) || 1;
      const [kx, ky, kz] = [x / n, y / n, z / n];
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      // Rodrigues: the height each face's outward side reaches once turned.
      const up = AXES.map((v) => {
        const dot = kx * v.x + ky * v.y + kz * v.z;
        const cross = kx * v.y - ky * v.x;
        return v.z * c + cross * s + kz * dot * (1 - c);
      });
      return LABELS[up.indexOf(Math.max(...up))];
    })
    .sort((a, b) => a - b);
};

const storedTable = async (page: Page) => parseTable(await page.evaluate((key) => window.localStorage.getItem(key), TABLE_KEY));

/** How wide the page is, or any of its tab panels' contents: nothing may be wider than the window. */
const sideways = (page: Page) =>
  page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.scrollWidth)));

test('a roll takes the layout’s medals as they go down, lands the dome on the dice drawn, lights what they won and pays it once', async ({ page }) => {
  test.setTimeout(90_000);
  await openTable(page);
  await expect(page.getByTestId('sb-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('sb-not-money')).toHaveText(NOT_MONEY.en);
  // On the floor jackpot: its best play with the jackpot added stays under 100%.
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');

  // Five on Small (a tap of five), and one each on the total 10, the 4 and the triple 6.
  await page.getByTestId('sb-step-5').click();
  await bet(page, 'small');
  await page.getByTestId('sb-step-1').click();
  for (const id of ['total-10', 'single-4', 'triple-6'] as const) await bet(page, id);
  await expect(page.getByTestId('sb-bet')).toHaveText('8');
  // The medals are taken as they go down, and the layout is kept with them on it.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 8);
  await expect(page.getByTestId('sb-medals')).toHaveText(String(WELCOME - 8));
  expect((await storedTable(page))?.bets).toEqual({ small: 5, 'total-10': 1, 'single-4': 1, 'triple-6': 1 });

  // 2 4 4: Small 1:1 (10), the total 10 at 6:1 (7), the 4 on two dice at 2:1 (3); the triple loses.
  await shake(page, drawn(2, 4, 4));
  // Settled as it was drawn: the medals are in, and the counter waits for the dice.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 8 + 20);
  expect(await shownMedals(page)).toBe(WELCOME - 8);
  await expect(page.getByTestId('sb-dome')).toHaveAttribute('data-running', 'true');
  await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 15_000 });
  // The dice in the dome show the roll drawn, as their own transforms say.
  expect(await domeFaces(page)).toEqual([2, 4, 4]);
  await expect(machine(page)).toHaveAttribute('data-dice', '2,4,4');
  await expect(machine(page)).toHaveAttribute('data-won', '20');
  for (const id of ['small', 'total-10', 'single-4', 'single-2', 'double-4', 'pair-2-4'] as const) await expect(page.getByTestId(`sb-area-${id}`)).toHaveAttribute('data-win', 'true');
  for (const id of ['big', 'triple-6', 'total-11'] as const) await expect(page.getByTestId(`sb-area-${id}`)).toHaveAttribute('data-win', 'false');
  await expect(page.getByTestId('sb-medals')).toHaveText(String(WELCOME + 12));
  await expect(page.getByTestId('sb-win')).toHaveText('20');
  await expect(page.getByTestId('sb-banner')).toHaveText('10 SMALL');
  await expect(page.getByTestId('sb-status')).toHaveText('2 · 4 · 4: 10, small. 20 medals back!');
  await expect(page.getByTestId('sb-history').locator('li[data-kind="small"]')).toHaveCount(1);
  await expect(page.getByTestId('sb-bet')).toHaveText('0');

  // After a reload the table shows the same medals, the same dice, the same board; so do the front and My Page.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('sb-medals')).toHaveText(String(WELCOME + 12));
  await expect(machine(page)).toHaveAttribute('data-dice', '2,4,4');
  expect(await domeFaces(page)).toEqual([2, 4, 4]);
  await expect(page.getByTestId('sb-history').locator('li[data-kind="small"]')).toHaveCount(1);
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME + 12));
  await expect(page.getByTestId('center-play-sic-bo')).toHaveAttribute('href', '/games/sic-bo');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-sic-bo')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-sic-bo-rounds')).toHaveText('1');
  await expect(page.getByTestId('mypage-sic-bo-won')).toHaveText('20');
});

test('bets left on the layout stay through a reload with their medals; the keys shake, skip, undo, clear and put the same bets back', async ({ page }) => {
  test.setTimeout(60_000);
  await openTable(page);
  await bet(page, 'big', 3);
  await bet(page, 'pair-5-6');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 4);
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('sb-area-big')).toHaveAttribute('data-amount', '3');
  await expect(page.getByTestId('sb-area-pair-5-6')).toHaveAttribute('data-amount', '1');
  await expect(page.getByTestId('sb-medals')).toHaveText(String(WELCOME - 4));
  expect(await bankBalance(page)).toBe(WELCOME - 4);

  // U takes the last medal off, C clears the layout, R puts nothing back yet (no roll).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('u');
  await expect(page.getByTestId('sb-area-pair-5-6')).toHaveAttribute('data-amount', '0');
  await page.keyboard.press('c');
  await expect(page.getByTestId('sb-bet')).toHaveText('0');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME);
  // A bet, then Space shakes and S skips straight to the dice at rest: 6 6 5, Big wins.
  await bet(page, 'big', 2);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await rigPresses(page, drawn(6, 6, 5));
  await page.keyboard.press('Space');
  await expect(page.getByTestId('sb-dome')).toHaveAttribute('data-running', 'true');
  await page.keyboard.press('s');
  await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 3_000 });
  expect(await domeFaces(page)).toEqual([5, 6, 6]);
  await expect(machine(page)).toHaveAttribute('data-won', '4');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME + 2);
  // R: the same bets again.
  await page.keyboard.press('r');
  await expect(page.getByTestId('sb-area-big')).toHaveAttribute('data-amount', '2');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME);
});

test('a triple: Small and Big lose, and the triple and any triple pay', async ({ page }) => {
  test.setTimeout(60_000);
  await openTable(page);
  for (const id of ['small', 'big', 'triple-3', 'any-triple'] as const) await bet(page, id);
  await shake(page, drawn(3, 3, 3));
  await page.getByTestId('sb-skip').click();
  await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 3_000 });
  expect(await domeFaces(page)).toEqual([3, 3, 3]);
  // The triple 181 and any triple 31.
  await expect(machine(page)).toHaveAttribute('data-won', '212');
  await expect(page.getByTestId('sb-banner')).toHaveText('TRIPLE 3');
  await expect(page.getByTestId('sb-area-small')).toHaveAttribute('data-win', 'false');
  await expect(page.getByTestId('sb-area-triple-3')).toHaveAttribute('data-win', 'true');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 4 + 212);
  await expect(page.getByTestId('sb-history').locator('li[data-kind="triple"]')).toHaveCount(1);
});

test('a reload while the dome shakes has paid the roll once, and shows the dice at rest on it', async ({ page }) => {
  test.setTimeout(60_000);
  await openTable(page);
  await bet(page, 'single-1', 2);
  await shake(page, drawn(1, 1, 6));
  await expect(page.getByTestId('sb-dome')).toHaveAttribute('data-running', 'true');
  await page.reload();
  await arrived(page);
  // 1 1 6: the single 1 on two dice, 2:1 on 2 medals.
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('sb-medals')).toHaveText(String(WELCOME - 2 + 6));
  await expect(machine(page)).toHaveAttribute('data-dice', '1,1,6');
  expect(await domeFaces(page)).toEqual([1, 1, 6]);
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  expect(await bankBalance(page)).toBe(WELCOME + 4);
  expect(await rolls(page)).toBe(1);
});

test('fits 375 and 320 px phones in English and Japanese, nothing moves through a roll, and SHAKE brings the dome into view', async ({ browser }) => {
  test.setTimeout(150_000);
  for (const [width, language] of [
    [375, 'en'],
    [320, 'ja'],
    [320, 'en'],
    [375, 'ja'],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openTable(page, language);
    const where = `${width} ${language}`;
    expect(await sideways(page), where).toBeLessThanOrEqual(width);
    // One part of the layout at a time, chosen with the picker; every part the same height.
    const heights = new Set<number>();
    for (const part of ['triples', 'totals', 'pairs', 'singles', 'bigSmall']) {
      await page.getByTestId(`sb-section-${part}`).click();
      heights.add(Math.round(await page.getByTestId('sb-layout').evaluate((el) => el.getBoundingClientRect().height)));
      expect(await sideways(page), where).toBeLessThanOrEqual(width);
    }
    expect([...heights], where).toHaveLength(1);
    await bet(page, 'small');
    // Where the dome, the words under it, the counters and the buttons stand, before and all through a roll.
    const at = () =>
      page.evaluate(() =>
        ['sb-dome', 'sb-status', 'sb-medals-led', 'sb-area-small', 'sb-shake', 'sb-skip', 'sb-sound', 'sb-history'].map((id) => {
          const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)}`;
        }),
      );
    const before = await at();
    // The player is down at SHAKE, the dome scrolled off: pressing SHAKE lifts the view to it.
    await page.getByTestId('sb-shake').evaluate((el) => {
      el.scrollIntoView({ block: 'end', behavior: 'instant' });
      window.scrollBy({ top: 200, behavior: 'instant' });
    });
    await shake(page, drawn(1, 2, 3));
    // As MedalCenter/lookUp.ts promises: most of the dome on the screen while the dice fly (centred, when it was not).
    await expect
      .poll(
        () =>
          page.getByTestId('sb-dome').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return (Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) / r.height;
          }),
        { timeout: 4_000 },
      )
      .toBeGreaterThanOrEqual(0.6);
    const seen = new Set<string>([JSON.stringify(before)]);
    while ((await machine(page).getAttribute('data-phase')) !== 'done') {
      seen.add(JSON.stringify(await at()));
      expect(await sideways(page), where).toBeLessThanOrEqual(width);
      await page.waitForTimeout(150);
    }
    seen.add(JSON.stringify(await at()));
    expect([...seen], where).toEqual([JSON.stringify(before)]);
    await expect(machine(page)).toHaveAttribute('data-won', '2');
    // The Odds tab fits too.
    await page.locator('#sb-tab-odds').click();
    await expect(page.getByTestId('sb-best')).toHaveText('97.22%');
    expect(await sideways(page), where).toBeLessThanOrEqual(width);
    await context.close();
  }
});

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a roll is shown in a moment, the dice put straight where they rest', async ({ page }) => {
    await openTable(page);
    await bet(page, 'total-17');
    const started = Date.now();
    await shake(page, drawn(6, 6, 5));
    await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 3_000 });
    expect(Date.now() - started).toBeLessThan(2_500);
    expect(await domeFaces(page)).toEqual([5, 6, 6]);
    await expect(page.getByTestId('sb-medals')).toHaveText(String(WELCOME - 1 + 61));
    const animation = await page.getByTestId('sb-area-total-17').evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
  });
});
