import { test, expect, type Page } from '@playwright/test';

import { POCKETS, pocketOfNumber, randomsFor } from '../../src/components/game/BallBingo/engine';
import { ROUND_KEY, parseRound } from '../../src/components/game/BallBingo/medals';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Ball Bingo plays with the medal center's medals. Every ball of a game is drawn with Math.random as START is pressed,
// so a test that wants a particular game queues the numbers that draw it (`randomsFor`), served only to that press
// (rigPresses.ts). The balls then fly to their pockets, or, with less motion, drop straight in.

const at = (id: string) => POCKETS.findIndex((p) => p.id === id);
const n = (number: number) => pocketOfNumber(number);
const OUT = at('out-l');
/** The full card: a free ball, CHANCE TIME, and every number. */
const FULL = [at('free-l'), at('chance'), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n)];
/** The card's top row (2, 7, 6), and two balls OUT. */
const ONE_LINE = [n(2), n(7), n(6), OUT, OUT];
/** Every ball OUT. */
const LOSS = [OUT, OUT, OUT, OUT, OUT];

const cabinet = (page: Page) => page.getByTestId('bingo-cabinet');

async function openBingo(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/ball-bingo');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(cabinet(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** The medals the machine shows. */
async function shown(page: Page): Promise<number> {
  return Number(((await page.getByTestId('bingo-medals').textContent()) ?? '').replace(/,/g, ''));
}
const led = (page: Page, id: string) => page.getByTestId(id).evaluate((el) => Number((el as HTMLElement).dataset.shown || 0));
const storedRound = async (page: Page) => parseRound(await page.evaluate((key) => window.localStorage.getItem(key), ROUND_KEY));

/** Bets `bet` medals and presses START with the game `draws` queued for the press, once hydration has attached it. */
async function start(page: Page, draws: number[], bet: 1 | 2 | 3 = 1) {
  await pressUntil(page.getByTestId(`bingo-bet-${bet}`), async () => (await page.getByTestId(`bingo-bet-${bet}`).getAttribute('aria-checked')) === 'true');
  await rigPresses(page, randomsFor(draws));
  const before = await shown(page);
  await pressUntil(page.getByTestId('bingo-start'), async () => (await cabinet(page).getAttribute('data-phase')) !== 'idle' && (await cabinet(page).getAttribute('data-phase')) !== 'over');
  expect(await shown(page)).toBe(before - bet);
}

/** How wide the page is, or any of its tab panels' contents: nothing may be wider than the window. */
const sideways = (page: Page) =>
  page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.scrollWidth)));

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a full card pays 500 a medal bet: the stake goes at START, the card fills ball by ball, and the medal center shows the same', async ({ page }) => {
    test.setTimeout(60_000);
    await openBingo(page);
    await expect(page.getByTestId('bingo-medals')).toHaveText(String(WELCOME));
    await expect(page.getByTestId('bingo-not-money')).toHaveText(NOT_MONEY.en);
    await start(page, FULL, 3);
    expect(await bankBalance(page)).toBe(WELCOME - 3);
    expect(await storedRound(page)).toMatchObject({ bet: 3, draws: FULL, paid: false });
    // The first ball (into FREE) comes back with one more: five to come, then six.
    await expect(page.getByTestId('bingo-balls')).toHaveText('6', { timeout: 5_000 });
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'ready');
    // LAUNCH: the second ball into CHANCE: CHANCE TIME, and four balls more.
    await page.getByTestId('bingo-launch').click();
    await expect(page.getByTestId('bingo-lamp-chance')).toHaveAttribute('data-on', 'true', { timeout: 5_000 });
    await expect(page.getByTestId('bingo-balls')).toHaveText('9');
    // Each ball marks its number.
    for (const number of [1, 2, 3]) {
      await page.getByTestId('bingo-launch').click();
      await expect(page.getByTestId(`bingo-cell-${number}`)).toHaveAttribute('data-marked', 'true', { timeout: 5_000 });
    }
    await expect.poll(async () => (await storedRound(page))?.shown).toBe(5);
    // SKIP drops the rest at once: the full card, paid.
    await page.getByTestId('bingo-skip').click();
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'over');
    await expect(page.getByTestId('bingo-card')).toHaveAttribute('data-lines', '8');
    await expect(page.getByTestId('bingo-result')).toHaveText('FULL CARD! 1500 medals.');
    await expect(page.getByTestId('bingo-medals')).toHaveText((WELCOME - 3 + 1500).toLocaleString('en-US'));
    await expect.poll(() => bankBalance(page)).toBe(WELCOME + 1497);
    await expect.poll(() => storedRound(page)).toBeNull();
    // The medal center's front shows the same medals, and the machine on its floor.
    await openCenter(page);
    await expect(page.getByTestId('center-balance')).toHaveText((WELCOME + 1497).toLocaleString('en-US'));
    await expect(page.getByTestId('center-play-ball-bingo')).toHaveAttribute('href', '/games/ball-bingo');
  });

  test('a game under way at a reload carries on after it with the same balls, from the ball it had got to, and is paid once', async ({ page }) => {
    test.setTimeout(60_000);
    await openBingo(page);
    await start(page, ONE_LINE, 1);
    // The first ball (the 2) is down, and written down; four to come.
    await expect(page.getByTestId('bingo-cell-2')).toHaveAttribute('data-marked', 'true', { timeout: 5_000 });
    await expect.poll(async () => (await storedRound(page))?.shown).toBe(1);
    await expect(page.getByTestId('bingo-balls')).toHaveText('4');

    await page.reload();
    await arrived(page);
    await expect(cabinet(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    // The page going paid it, once; the tab carries on with it where it stood. Its 2 medals are not on the meters until
    // its last ball is down.
    await expect(page.getByTestId('bingo-resumed')).toBeVisible();
    await expect(page.getByTestId('bingo-cell-2')).toHaveAttribute('data-marked', 'true');
    await expect(page.getByTestId('bingo-balls')).toHaveText('4');
    expect(await bankBalance(page)).toBe(WELCOME - 1 + 2);
    await expect(page.getByTestId('bingo-medals')).toHaveText(String(WELCOME - 1));
    // The rest of its balls: the 7 and the 6, then OUT and OUT.
    await pressUntil(page.getByTestId('bingo-launch'), async () => (await page.getByTestId('bingo-cell-7').getAttribute('data-marked')) === 'true');
    await page.getByTestId('bingo-skip').click();
    await expect(page.getByTestId('bingo-result')).toHaveText('BINGO! 1 line: 2 medals.');
    await expect(page.getByTestId('bingo-medals')).toHaveText(String(WELCOME + 1));
    expect(await bankBalance(page)).toBe(WELCOME + 1);
    await expect.poll(() => storedRound(page)).toBeNull();

    // Nothing more comes of it, however often the page is opened.
    await page.reload();
    await arrived(page);
    await expect(cabinet(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    await page.waitForTimeout(800);
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'idle');
    await expect(page.getByTestId('bingo-medals')).toHaveText(String(WELCOME + 1));
    expect(await bankBalance(page)).toBe(WELCOME + 1);
  });

  test('the medals are played at one machine at a time: another tab takes them, this one waits, and Play here brings them back', async ({ page, context }) => {
    test.setTimeout(60_000);
    await openBingo(page);
    await start(page, LOSS, 1);
    await page.getByTestId('bingo-skip').click();
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'over');
    const other = await context.newPage();
    await openBingo(other);
    await expect(page.getByTestId('bingo-card-away')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('bingo-start')).toBeDisabled();
    await expect.poll(() => shown(other)).toBe(WELCOME - 1);
    await page.bringToFront();
    await page.getByTestId('bingo-play-here').click();
    await expect(page.getByTestId('bingo-card-away')).toHaveCount(0);
    await expect(other.getByTestId('bingo-card-away')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('bingo-start')).toBeEnabled();
  });

  test('fits the narrowest phones in both languages, nothing scrolls sideways, and nothing moves as a game is played', async ({ browser }) => {
    test.setTimeout(120_000);
    for (const language of ['en', 'ja'] as const) {
      for (const width of [320, 375]) {
        const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await openBingo(page, language);
        const where = `${language} ${width}`;
        expect(await sideways(page), where).toBeLessThanOrEqual(width);
        // The tabs say their names on one line, and fit.
        const right = await page.getByRole('tablist').evaluate((el) => el.getBoundingClientRect().right);
        expect(right, where).toBeLessThanOrEqual(width);
        const places = () =>
          page.evaluate(() =>
            ['bingo-card', 'bingo-board', 'bingo-medals-led', 'bingo-paystrip', 'bingo-result'].map((id) => {
              const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
              return [Math.round(r.top + window.scrollY), Math.round(r.height)];
            }),
          );
        const button = () => page.locator('[data-testid="bingo-start"], [data-testid="bingo-launch"]').evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
        const idle = await places();
        const idleButton = await button();
        await start(page, ONE_LINE, 1);
        await expect(page.getByTestId('bingo-cell-2')).toHaveAttribute('data-marked', 'true', { timeout: 5_000 });
        expect(await places(), `${where} in play`).toEqual(idle);
        expect(await button(), `${where} in play`).toBe(idleButton);
        await page.getByTestId('bingo-skip').click();
        await expect(cabinet(page)).toHaveAttribute('data-phase', 'over');
        expect(await places(), `${where} over`).toEqual(idle);
        expect(await button(), `${where} over`).toBe(idleButton);
        expect(await sideways(page), where).toBeLessThanOrEqual(width);
        await context.close();
      }
    }
  });

  test('the Odds tab shows the exact return and the chance of every count of lines', async ({ page }) => {
    await openBingo(page);
    await page.getByRole('tab', { name: 'Odds' }).click();
    await expect(page.getByTestId('bingo-odds-rtp')).toHaveText('89.974%');
    await expect(page.getByTestId('bingo-odds-lines').locator('tbody tr')).toHaveCount(9);
    await expect(page.getByTestId('bingo-odds-full')).toContainText('12,747');
    // What the floor jackpot adds, under the machine's own odds: the machine is linked to it.
    await expect(page.getByTestId('floor-jackpot-odds')).toHaveAttribute('data-linked', 'true');
  });
});

test('a ball is shot up the lane, falls through the pins and drops into the pocket drawn for it', async ({ page }) => {
  test.setTimeout(60_000);
  await openBingo(page);
  await start(page, LOSS, 1);
  // In the air: the ball's place is written on the drawing frame by frame, and it moves.
  await expect(page.getByTestId('bingo-board')).toHaveAttribute('data-flying', 'true');
  const ball = page.locator('[data-testid="bingo-board"] g[data-flying]');
  const places: string[] = [];
  for (let i = 0; i < 8; i++) {
    places.push((await ball.getAttribute('transform')) ?? '');
    await page.waitForTimeout(150);
  }
  expect(new Set(places).size).toBeGreaterThan(4);
  // It comes down in OUT, the pocket drawn for it: nothing marked, four balls to come.
  await expect(page.getByTestId('bingo-balls')).toHaveText('4', { timeout: 10_000 });
  await expect(page.getByTestId('bingo-board')).toHaveAttribute('data-flying', 'false');
  await expect(page.getByTestId('bingo-card')).toHaveAttribute('data-marks', '0');
  await page.getByTestId('bingo-skip').click();
  await expect(page.getByTestId('bingo-result')).toHaveText('No line this game.');
  expect(await bankBalance(page)).toBe(WELCOME - 1);
  expect(await led(page, 'bingo-medals-led')).toBe(WELCOME - 1);
});
