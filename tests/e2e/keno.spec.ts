import { test, expect, type Browser, type Page } from './fixtures';

import { numbersFor } from '../../src/components/game/Keno/engine';
import { GAME_KEY, TICKET_KEY, parseGame } from '../../src/components/game/Keno/medalTable';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Video Keno plays with the medal center's medals. A game's twenty balls are drawn from twenty numbers of Math.random in
// the press of DRAW (engine.ts `drawBalls`), and a quick pick's spots the same way in its press, so a test queues the
// numbers that draw the balls or the spots it needs (rigPresses.ts). The floor's API answers at once (fixtures.ts);
// nothing reaches a real server.

test.beforeEach(async ({ context }) => {
  // One button after another on a page taller than the window: the page scrolls at once, so no press lands elsewhere.
  await instantScroll(context);
});

const machine = (page: Page) => page.getByTestId('kn-machine');

/** Twenty balls: those given first, then the smallest numbers not given and not in `avoid`, and `last` last. */
function ballsWith(first: readonly number[], last: number, avoid: readonly number[] = []): number[] {
  const balls = [...first];
  for (let n = 1; balls.length < 19; n++) if (!balls.includes(n) && n !== last && !avoid.includes(n)) balls.push(n);
  return [...balls, last];
}

async function openKeno(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/keno'))?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const record = async (page: Page) => parseGame(await page.evaluate((key) => window.localStorage.getItem(key), GAME_KEY));

/** Marks `spots` on the board, showing each one's half first where a phone shows one at a time. */
async function mark(page: Page, spots: readonly number[]) {
  for (const n of spots) {
    const cell = page.getByTestId(`kn-cell-${n}`);
    if (!(await cell.isVisible())) await page.getByTestId(n <= 40 ? 'kn-half-top' : 'kn-half-bottom').click();
    await pressUntil(cell, async () => (await cell.getAttribute('aria-pressed')) === 'true');
  }
}

/** DRAW with the balls drawn as `balls`: pressed again only while no game has been written down, so never twice. */
async function draw(page: Page, balls: readonly number[], button = 'kn-draw') {
  await rigPresses(page, numbersFor(balls));
  const before = (await record(page))?.id ?? null;
  await pressUntil(page.getByTestId(button), async () => ((await record(page))?.id ?? null) !== before);
}

/** Waits for the game's last ball, and its end. */
const ended = (page: Page) => expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 15_000 });

test('a game takes the bet at DRAW, its balls come out one by one, the caught spots and the paytable light up, the last ball pays ×5 once; the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  await openKeno(page);
  await expect(page.getByTestId('kn-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('kn-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');
  await expect(page.getByTestId('kn-draw')).toBeDisabled();
  await mark(page, [1, 2, 3, 80]);
  await page.getByTestId('kn-bet-2').click();
  await expect(page.getByTestId('kn-bet-2')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('kn-status')).toHaveText('4 spots on a bet of 2: press DRAW.');
  // Three of the four caught, the last of them on the twentieth ball: 4 a medal, ×5, on a bet of 2.
  const balls = ballsWith([1, 2], 80, [3]);
  await draw(page, balls);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2);
  await expect(machine(page)).toHaveAttribute('data-phase', 'draw');
  expect((await record(page))?.balls).toEqual(balls);
  // The first two balls are spots: they glow, and the paytable's row for two of four lights up.
  await expect(page.getByTestId('kn-cell-2')).toHaveAttribute('data-caught', 'true', { timeout: 5_000 });
  await expect(page.getByTestId('kn-cell-1')).toHaveAttribute('data-caught', 'true');
  await expect(page.getByTestId('kn-paytable').locator('tr[data-caught="2"]')).toHaveAttribute('data-lit', 'true');
  await expect(page.getByTestId('kn-cell-80')).toHaveAttribute('data-caught', 'false');
  await expect(page.getByTestId('kn-skip')).toBeEnabled();
  await ended(page);
  await expect(page.getByTestId('kn-cell-80')).toHaveAttribute('data-caught', 'true');
  await expect(page.getByTestId('kn-last-lamp')).toHaveAttribute('data-lit', 'true');
  await expect(page.getByTestId('kn-paytable').locator('tr[data-caught="3"]')).toHaveAttribute('data-lit', 'true');
  await expect(page.getByTestId('kn-paytable').locator('tr[data-caught="3"]')).toContainText('8 ×5 = 40');
  await expect(page.getByTestId('kn-status')).toHaveText('LAST BALL ×5! Caught 3 of 4: +40');
  await expect(page.getByTestId('kn-tray').locator('li[data-out="true"]')).toHaveCount(20);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2 + 40);
  await expect(page.getByTestId('kn-medals-led')).toHaveAttribute('data-shown', String(WELCOME + 38), { timeout: 6_000 });
  await expect(page.getByTestId('kn-history').locator('li').first()).toHaveAttribute('data-last-ball', 'true');
  expect(await record(page)).toMatchObject({ paid: true, won: 40 });

  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText((WELCOME + 38).toLocaleString('en-US'));
  await expect(page.getByTestId('center-play-keno')).toHaveAttribute('href', '/games/keno');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-keno')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-keno-rounds')).toHaveText('1');
  await expect(page.getByTestId('mypage-keno-won')).toHaveText('40');
});

test('Same spots draws the last ticket again in one press; the ticket stays through a reload; ten spots at most', async ({ page }) => {
  test.setTimeout(90_000);
  await openKeno(page);
  await mark(page, [5, 15, 25]);
  await draw(page, ballsWith([5], 79, [15, 25]));
  await page.getByTestId('kn-skip').click();
  await ended(page);
  // One of three pays nothing: no win.
  await expect(page.getByTestId('kn-status')).toHaveText('Caught 1 of 3. No win this time.');
  expect(await bankBalance(page)).toBe(WELCOME - 1);

  // Through a reload: the ticket is still marked, and the last game is shown with its balls.
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  for (const n of [5, 15, 25]) await expect(page.getByTestId(`kn-cell-${n}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('kn-resumed')).toHaveText('Last game');
  await expect(page.getByTestId('kn-cell-5')).toHaveAttribute('data-caught', 'true');
  expect(JSON.parse((await page.evaluate((key) => window.localStorage.getItem(key), TICKET_KEY)) ?? 'null')).toEqual({ spots: [5, 15, 25], bet: 1 });

  // Erased, then Same spots: the three marked again, and drawn, in one press.
  await page.getByTestId('kn-erase').click();
  await expect(page.getByTestId('kn-cell-5')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('kn-draw')).toBeDisabled();
  await draw(page, ballsWith([5, 15, 25], 80), 'kn-same');
  expect((await record(page))?.spots).toEqual([5, 15, 25]);
  await page.getByTestId('kn-skip').click();
  await ended(page);
  await expect(page.getByTestId('kn-status')).toHaveText('Caught 3 of 3: +23');
  expect(await bankBalance(page)).toBe(WELCOME - 2 + 23);

  // Ten spots at most: an eleventh is not marked, and the machine says why.
  await mark(page, [31, 32, 33, 34, 35, 36, 37]);
  await page.getByTestId('kn-cell-38').click();
  await expect(page.getByTestId('kn-cell-38')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('kn-message')).toHaveText('10 spots at most: tap a marked number to take it off.');
});

test('a reload in the middle of a draw shows the same draw, and pays it once', async ({ page }) => {
  test.setTimeout(60_000);
  await openKeno(page);
  await mark(page, [10, 20, 30, 40, 50]);
  await page.getByTestId('kn-bet-5').click();
  // Every spot caught, the last on the last ball: 250 a medal, ×5, on a bet of 5.
  const balls = ballsWith([10, 20, 30, 40], 50);
  await draw(page, balls);
  await expect.poll(async () => Number(await machine(page).getAttribute('data-shown'))).toBeGreaterThanOrEqual(3);
  const id = (await record(page))!.id;
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  // Settled as the page went: the same game, its balls as drawn, paid once.
  await expect(machine(page)).toHaveAttribute('data-round', id);
  await expect(machine(page)).toHaveAttribute('data-phase', 'done');
  for (const n of balls) await expect(page.getByTestId(`kn-cell-${n}`)).toHaveAttribute('data-drawn', 'true');
  await expect(page.getByTestId('kn-tray').locator('li').last()).toHaveText('50');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 5 + 6_250);
  expect(await record(page)).toMatchObject({ id, balls, paid: true, won: 6_250 });
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME - 5 + 6_250);
  // And the next game goes on as ever.
  await draw(page, ballsWith([], 1, [10, 20, 30, 40, 50]));
  await page.getByTestId('kn-skip').click();
  await ended(page);
  expect(await bankBalance(page)).toBe(WELCOME - 10 + 6_250);
});

test('on a desk the keys play it: B changes the bet, Q quick picks, Space draws and skips, R draws the same spots, C erases; the Odds tab holds the draw', async ({ page }) => {
  test.setTimeout(90_000);
  await openKeno(page);
  // Space and Enter press a focused button as anywhere: the keys are the machine's once nothing is focused.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  if (await page.evaluate(() => window.matchMedia('(hover: none)').matches)) await expect(page.getByTestId('kn-keys')).toBeHidden();
  else await expect(page.getByTestId('kn-keys')).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.getByTestId('kn-bet-2')).toHaveAttribute('aria-checked', 'true');
  // A quick pick of five, drawn in the press.
  await rigPresses(page, numbersFor([70, 3, 33, 12, 41]));
  await page.keyboard.press('q');
  for (const n of [3, 12, 33, 41, 70]) await expect(page.getByTestId(`kn-cell-${n}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('kn-paytable')).toHaveAttribute('data-spots', '5');
  await rigPresses(page, numbersFor(ballsWith([3, 12], 70, [33, 41])));
  await page.keyboard.press(' ');
  await expect(machine(page)).toHaveAttribute('data-phase', 'draw');
  await expect.poll(async () => Number(await machine(page).getAttribute('data-shown'))).toBeGreaterThanOrEqual(2);
  // A look at the odds holds the draw where it is; it goes on when the machine is shown again.
  await page.locator('#kn-tab-odds').click();
  const held = Number(await machine(page).getAttribute('data-shown'));
  await page.waitForTimeout(1_500);
  expect(Number(await machine(page).getAttribute('data-shown'))).toBe(held);
  await page.locator('#kn-tab-machine').click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(async () => Number(await machine(page).getAttribute('data-shown'))).toBeGreaterThan(held);
  // S skips to the end: three of five caught, the last on the last ball, 3 × 5 on a bet of 2.
  await page.keyboard.press('s');
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-won', '30');
  // R draws the same five again; C erases once it is over.
  await rigPresses(page, numbersFor(ballsWith([], 1, [3, 12, 33, 41, 70])));
  const before = (await record(page))!.id;
  await page.keyboard.press('r');
  await expect.poll(async () => (await record(page))?.id).not.toBe(before);
  expect((await record(page))?.spots).toEqual([3, 12, 33, 41, 70]);
  await page.keyboard.press(' ');
  await ended(page);
  await page.keyboard.press('c');
  await expect(page.getByTestId('kn-cell-3')).toHaveAttribute('aria-pressed', 'false');
  expect(await bankBalance(page)).toBe(WELCOME - 4 + 30);
});

/** A phone, in a language, with the floor faked. */
async function phone(browser: Browser, width: number, language: 'en' | 'ja') {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 812 }, isMobile: true, hasTouch: true });
  await instantScroll(context);
  const page = await context.newPage();
  await openKeno(page, language);
  return { context, page };
}

test('fits 375 and 320 px phones in English and Japanese: one half of the board at a time, every number 44 px or more, and nothing moves through a draw', async ({ browser }) => {
  test.setTimeout(150_000);
  for (const [width, language] of [
    [375, 'en'],
    [375, 'ja'],
    [320, 'en'],
    [320, 'ja'],
  ] as const) {
    const where = `${width} px ${language}`;
    const { context, page } = await phone(browser, width, language);
    const sideways = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.scrollWidth)));
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    // One half at a time: 1 to 40, every number of it at least 44 px a side.
    await expect(page.getByTestId('kn-cell-1')).toBeVisible();
    await expect(page.getByTestId('kn-cell-41')).toBeHidden();
    const sizes = await page.getByTestId('kn-board').locator('button:visible').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)));
    expect(sizes, where).toHaveLength(40);
    expect(Math.min(...sizes), where).toBeGreaterThanOrEqual(44);
    await mark(page, [7, 44]);
    await expect(page.getByTestId('kn-cell-41')).toBeVisible();
    await expect(page.getByTestId('kn-cell-1')).toBeHidden();
    await page.getByTestId('kn-draw').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const boxes = () =>
      page.evaluate(() =>
        ['kn-screen', 'kn-board', 'kn-tray', 'kn-paytable', 'kn-status', 'kn-medals-led', 'kn-win-led', 'kn-draw', 'kn-skip', 'kn-message', 'kn-sound'].map((id) => {
          const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)} ${Math.round(box.left)} ${Math.round(box.width)}`;
        }),
      );
    const before = await boxes();
    const seen = new Set<string>([JSON.stringify(before)]);
    await draw(page, ballsWith([7, 44], 1));
    // DRAW brings the screen into view.
    await expect
      .poll(() =>
        page.getByTestId('kn-board').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight + 1;
        }),
      )
      .toBe(true);
    for (let i = 0; i < 12; i++) {
      seen.add(JSON.stringify(await boxes()));
      await page.waitForTimeout(150);
    }
    await page.getByTestId('kn-skip').click();
    await ended(page);
    seen.add(JSON.stringify(await boxes()));
    expect([...seen], where).toEqual([JSON.stringify(before)]);
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    // Both spots caught (two of two pay 4), every ball in the tray whichever half is shown.
    await expect(machine(page)).toHaveAttribute('data-won', '4');
    await expect(page.getByTestId('kn-tray').locator('li[data-out="true"]')).toHaveCount(20);
    await expect(page.getByTestId('kn-half-top')).toHaveAttribute('aria-label', language === 'en' ? 'Numbers 1 to 40: 1 marked, 1 caught' : '1〜40の数字：1個えらび中、1個当たり');
    // Everything the screen prints is at least 11 px: readable on the narrowest phone.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="kn-screen"] *')].flatMap((el) => {
        const own = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '');
        const size = parseFloat(getComputedStyle(el).fontSize);
        return own && el.getClientRects().length > 0 && size < 10.95 ? [`${el.textContent} ${size.toFixed(1)}px`] : [];
      }),
    );
    expect(small, `${where}: text under 11 px`).toEqual([]);
    // The tap targets: DRAW, Skip, the halves and the bets at least 44 px.
    for (const id of ['kn-draw', 'kn-skip', 'kn-half-top', 'kn-half-bottom', 'kn-bet-10', 'kn-quick', 'kn-erase', 'kn-same']) {
      const size = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect());
      expect(Math.min(size.width, size.height), `${where}: ${id}`).toBeGreaterThanOrEqual(44);
    }
    // The Odds tab fits too.
    await page.locator('#kn-tab-odds').click();
    await expect(page.getByTestId('kn-best')).toHaveText('90.00%');
    await expect(page.getByTestId('kn-worst')).toHaveText('89.68%');
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    await context.close();
  }
});

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the balls are simply put in place: the whole draw at once, and the game paid', async ({ page }) => {
    test.setTimeout(60_000);
    await openKeno(page);
    await mark(page, [11]);
    const started = Date.now();
    await draw(page, ballsWith([], 11));
    await ended(page);
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(machine(page)).toHaveAttribute('data-shown', '20');
    await expect(page.getByTestId('kn-last-lamp')).toHaveAttribute('data-lit', 'true');
    // One spot caught on the last ball: 3 × 5.
    await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + 15);
  });
});
