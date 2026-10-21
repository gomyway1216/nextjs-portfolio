import { test, expect, type Browser, type Page } from './fixtures';

import { JACKPOT, drawFor, numbersFor, type Draw } from '../../src/components/game/BallTower/engine';
import { RUN_KEY, parseRun } from '../../src/components/game/BallTower/medalTable';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Firework Ball Tower (ball-tower) plays with the medal center's medals. Everything random about a run is drawn from ten
// numbers of Math.random in the press of START (engine.ts `drawRun`), so a test queues the numbers that draw the run it
// needs (rigPresses.ts). The floor's API answers at once (fixtures.ts); nothing reaches a real server.

test.beforeEach(async ({ context }) => {
  // One button after another on a page taller than the window: the page scrolls at once, so no press lands elsewhere.
  await instantScroll(context);
});

const machine = (page: Page) => page.getByTestId('bt-machine');
/** UP on the top disc, then ×3 on the second: 3 a medal bet. */
const PAYS_3 = drawFor(['up', 'pay'], 3);
/** UP on every disc, and JP: the jackpot. */
const JACKPOT_RUN = drawFor(['up', 'up', 'up', 'up', 'jackpot']);
/** UP on the first three discs, and ×12 on the chance disc. */
const CHANCE_12 = drawFor(['up', 'up', 'up', 'pay'], 12);

async function openTower(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/ball-tower'))?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const record = async (page: Page) => parseRun(await page.evaluate((key) => window.localStorage.getItem(key), RUN_KEY));

/** START with the run drawn as `draw`: pressed again only while no run has been written down, so never twice. */
async function start(page: Page, draw: Draw) {
  await rigPresses(page, numbersFor(draw));
  const before = (await record(page))?.id ?? null;
  await pressUntil(page.getByTestId('bt-start'), async () => ((await record(page))?.id ?? null) !== before);
}

/** Picks the bet `bet` on the seat's buttons. */
async function bet(page: Page, value: number) {
  await page.getByTestId(`bt-bet-${value}`).click();
  await expect(machine(page)).toHaveAttribute('data-bet', String(value));
}

/** Waits for the run to have ended, the machine at rest. */
const ended = (page: Page, timeout = 30_000) => expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout });

/** Hides or shows the page, as a tab put away and brought back. */
const hidden = (page: Page, hide: boolean) =>
  page.evaluate((hide) => {
    if (hide) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    else delete (document as unknown as { visibilityState?: string }).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hide);

test('ball-tower: a ball takes its bet, comes down the discs as drawn, pays once, and the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  // The page is drawn the same by the server and the browser.
  const mismatches: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) mismatches.push(message.text().slice(0, 200));
  });
  await openTower(page);
  await expect(page.getByTestId('bt-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('bt-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');
  await bet(page, 2);
  await expect(page.getByTestId('bt-jackpot')).toHaveAttribute('data-amount', String(JACKPOT * 2));
  await start(page, PAYS_3);
  // The bet is out of the medals at once; the pocket pays as the ball comes to rest.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2);
  await expect(page.getByTestId('bt-status')).toHaveText('Up the lift it goes…');
  // No other bet while the ball is in play.
  await expect(page.getByTestId('bt-bet-5')).toBeDisabled();
  await expect(machine(page)).toHaveAttribute('data-level', '0', { timeout: 10_000 });
  await expect(machine(page)).toHaveAttribute('data-level', '1', { timeout: 15_000 });
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-result', 'pay');
  await expect(machine(page)).toHaveAttribute('data-won', '6');
  await expect(page.getByTestId('bt-status')).toHaveText('×3 on disc 2! +6');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2 + 6);
  await expect(page.getByTestId('bt-medals-led')).toHaveAttribute('data-shown', String(WELCOME + 4), { timeout: 8_000 });
  const done = await record(page);
  expect(done).toMatchObject({ paid: true, bet: 2 });
  expect(done).not.toHaveProperty('away');
  expect(mismatches).toEqual([]);

  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText((WELCOME + 4).toLocaleString('en-US'));
  await expect(page.getByTestId('center-play-ball-tower')).toHaveAttribute('href', '/games/ball-tower');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-ball-tower')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-ball-tower-rounds')).toHaveText('1');
  await expect(page.getByTestId('mypage-ball-tower-won')).toHaveText('6');
});

test('ball-tower: ← and → change the bet, Space starts, Skip waits for the ball to reach the top, and the jackpot pays ×300 the bet', async ({ page }) => {
  test.setTimeout(90_000);
  await openTower(page);
  // Space and Enter press a focused button as anywhere: the keys are the machine's once nothing is focused.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(machine(page)).toHaveAttribute('data-bet', '10');
  await page.keyboard.press('ArrowLeft');
  await expect(machine(page)).toHaveAttribute('data-bet', '5');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bt-jackpot')).toHaveAttribute('data-amount', '3000');
  await rigPresses(page, numbersFor(JACKPOT_RUN));
  await page.keyboard.press(' ');
  await expect.poll(async () => (await record(page))?.bet).toBe(10);
  const skip = page.getByTestId('bt-skip');
  // Skip only fast-forwards: it waits for the ball to reach the top of the tower, and says so.
  await expect(skip).toBeDisabled();
  await expect(skip).toHaveAccessibleDescription('once the ball is up');
  await page.keyboard.press('s');
  await expect(machine(page)).toHaveAttribute('data-phase', 'lift');
  await expect(machine(page)).toHaveAttribute('data-skippable', 'true', { timeout: 10_000 });
  await expect(skip).toBeEnabled();
  await page.keyboard.press('s');
  // Straight to its pocket: far sooner than the ten seconds and more it takes to come down all five discs.
  await ended(page, 3_000);
  await expect(machine(page)).toHaveAttribute('data-result', 'jackpot');
  await expect(machine(page)).toHaveAttribute('data-level', '4');
  await expect(page.getByTestId('bt-flash')).toHaveText('JACKPOT!!');
  await expect(page.getByTestId('bt-status')).toHaveText('JACKPOT!! +3,000');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 10 + 3_000);
  await expect(skip).toBeDisabled();
});

test('ball-tower: standing unplayed it asks the browser for no frames; a run does, and stops while the Odds tab is open', async ({ page }) => {
  test.setTimeout(60_000);
  // Every frame the page asks for is counted.
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const ask = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      ask((time) => {
        w.__frames += 1;
        callback(time);
      });
  });
  const frames = () => page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  await openTower(page);
  await page.waitForTimeout(1_000);
  const idle = await frames();
  await page.waitForTimeout(2_000);
  expect((await frames()) - idle, 'frames asked for in 2 s standing unplayed').toBeLessThanOrEqual(2);
  // The canvas has as many pixels as it is shown at.
  const canvas = await page.getByTestId('bt-canvas').evaluate((el: HTMLCanvasElement) => ({ width: el.width, shown: el.getBoundingClientRect().width, ratio: Math.min(2, window.devicePixelRatio || 1) }));
  expect(canvas.width).toBe(Math.max(1, Math.round(canvas.shown * canvas.ratio)));
  await start(page, CHANCE_12);
  await expect(machine(page)).toHaveAttribute('data-level', '1', { timeout: 15_000 });
  const running = await frames();
  await page.waitForTimeout(500);
  // More than standing still allows (2 in 2 s): the run asks for frames. Not a frame rate: Firefox on the CI runner
  // draws the canvas in software at 12-20 frames a second.
  expect((await frames()) - running, 'frames asked for in 0.5 s of a run').toBeGreaterThan(2);
  // The Odds tab in front: the clock stops, no frames are asked for, and the ball stays on the disc it was on.
  await page.locator('#bt-tab-odds').click();
  await page.waitForTimeout(300);
  const paused = await frames();
  const level = await machine(page).getAttribute('data-level');
  await page.waitForTimeout(2_500);
  expect((await frames()) - paused, 'frames asked for in 2.5 s behind the Odds tab').toBeLessThanOrEqual(2);
  expect(await machine(page).getAttribute('data-level')).toBe(level);
  expect(await machine(page).getAttribute('data-phase')).toBe('run');
  // The Odds tab: the return on every bet, and each disc's pockets.
  await expect(page.getByTestId('bt-back')).toHaveText('90.00%');
  await expect(page.getByTestId('bt-disc-0').locator('tr[data-kind="up"] td').first()).toHaveText('6/18');
  await page.locator('#bt-tab-machine').click();
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-won', '12');
});

test('ball-tower: a reload in the middle of a run finishes it as drawn, pays it once, and says so when the page comes back', async ({ page }) => {
  test.setTimeout(60_000);
  await openTower(page);
  await start(page, PAYS_3);
  await expect(machine(page)).toHaveAttribute('data-phase', 'run', { timeout: 10_000 });
  const id = (await record(page))!.id;
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + 3);
  expect(await record(page)).toMatchObject({ id, paid: true, away: true });
  await expect(page.getByTestId('bt-resumed')).toHaveText('Finished from before');
  await expect(page.getByTestId('bt-message')).toHaveText('The run was finished while you were away: it paid 3 medals.');
  await expect(machine(page)).toHaveAttribute('data-result', 'pay');
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME + 2);
  // The next run clears the word.
  await start(page, drawFor(['out']));
  await expect(page.getByTestId('bt-message')).toHaveText('');
  await expect(page.getByTestId('bt-resumed')).toHaveCount(0);
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-result', 'out');
  expect(await bankBalance(page)).toBe(WELCOME + 1);
});

test('ball-tower: a page put away mid-run finishes it at once, and says so when it is shown again; a moment’s loan of the card does not', async ({ context, page }) => {
  test.setTimeout(90_000);
  // The medal center is open in another tab first, so that the day's bonus is there to take in the middle of a run.
  const hub = await context.newPage();
  await openCenter(hub);
  await expect(hub.getByTestId('pusher-bonus-take')).toBeVisible();
  await page.bringToFront();
  await openTower(page);
  await start(page, CHANCE_12);
  await expect(machine(page)).toHaveAttribute('data-level', '0', { timeout: 10_000 });
  // Taken there, the bonus borrows the medals for a moment: the run is as it was, the ball coming down, nothing paid.
  await hub.getByTestId('pusher-bonus-take').click();
  await expect(hub.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  await hub.close();
  await expect(machine(page)).toHaveAttribute('data-card', 'here');
  expect(await record(page)).toMatchObject({ paid: false });
  await expect(machine(page)).toHaveAttribute('data-phase', 'run');
  await ended(page);
  const played = (await record(page))!;
  expect(played).toMatchObject({ paid: true });
  expect(played.away).toBeUndefined();
  await expect(machine(page)).toHaveAttribute('data-won', '12');
  await expect(page.getByTestId('bt-message')).toHaveText('');
  // Put away mid-run: finished as the page goes, and said when it comes back.
  const before = await bankBalance(page);
  await start(page, PAYS_3);
  await expect(machine(page)).toHaveAttribute('data-phase', 'run', { timeout: 10_000 });
  await hidden(page, true);
  await expect.poll(async () => (await record(page))?.paid).toBe(true);
  expect(await record(page)).toMatchObject({ away: true });
  expect(await bankBalance(page)).toBe(before - 1 + 3);
  await hidden(page, false);
  await expect(page.getByTestId('bt-message')).toHaveText('The run was finished while you were away: it paid 3 medals.');
  await expect(machine(page)).toHaveAttribute('data-phase', 'idle');
});

test('ball-tower: another tab’s tower taking the medals finishes the run there; the first tab shows it finished when it is played again', async ({ context, page }) => {
  test.setTimeout(60_000);
  await openTower(page);
  await start(page, PAYS_3);
  await expect(machine(page)).toHaveAttribute('data-phase', 'run', { timeout: 10_000 });
  const other = await context.newPage();
  await other.goto('/games/ball-tower');
  await arrived(other);
  await expect(other.getByTestId('bt-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect.poll(async () => (await record(other))?.paid).toBe(true);
  expect(await record(other)).toMatchObject({ away: true });
  await expect(other.getByTestId('bt-message')).toHaveText('The run was finished while you were away: it paid 3 medals.');
  expect(await bankBalance(other)).toBe(WELCOME - 1 + 3);
  await other.close();
  await page.bringToFront();
  await page.getByTestId('bt-play-here').click();
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(machine(page)).toHaveAttribute('data-result', 'pay');
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME + 2);
});

/** A phone, in a language, with the floor faked; with less motion asked for when `calm`. */
async function phone(browser: Browser, width: number, language: 'en' | 'ja', calm: boolean) {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 812 }, isMobile: true, hasTouch: true, reducedMotion: calm ? 'reduce' : 'no-preference' });
  await instantScroll(context);
  const page = await context.newPage();
  await openTower(page, language);
  return { context, page };
}

test('ball-tower fits 375 and 320 px phones in English and Japanese: the whole tower and START on screen together, every button 44 px, and nothing moves through a run', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const [width, language, calm] of [
    [375, 'en', false],
    [375, 'ja', true],
    [320, 'en', true],
    [320, 'ja', false],
  ] as const) {
    const where = `${width} px ${language}${calm ? ', less motion' : ''}`;
    const { context, page } = await phone(browser, width, language, calm);
    const sideways = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.scrollWidth)));
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    // Scrolled down to START, as a player who has read the page; START brings the tower on screen with it.
    await page.getByTestId('bt-start').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const boxes = () =>
      page.evaluate(() =>
        ['bt-board', 'bt-status', 'bt-bet-1', 'bt-bet-10', 'bt-start', 'bt-skip', 'bt-medals-led', 'bt-win-led', 'bt-message', 'bt-sound'].map((id) => {
          const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)} ${Math.round(box.left)} ${Math.round(box.width)}`;
        }),
      );
    const before = await boxes();
    const seen = new Set<string>([JSON.stringify(before)]);
    await start(page, CHANCE_12);
    const inView = (id: string) =>
      page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('[class*="GlobalToolbar"]')?.getBoundingClientRect().bottom ?? 0;
        return r.top >= bar - 1 && r.bottom <= window.innerHeight + 1;
      });
    await expect.poll(() => inView('bt-board'), { message: `${where}: the tower` }).toBe(true);
    for (const id of ['bt-status', 'bt-start', 'bt-skip']) expect(await inView(id), `${where}: ${id}`).toBe(true);
    for (const level of ['0', '1', '2', '3']) {
      await expect(machine(page)).toHaveAttribute('data-level', level, { timeout: 15_000 });
      seen.add(JSON.stringify(await boxes()));
      expect(await sideways(), where).toBeLessThanOrEqual(width);
    }
    await ended(page);
    seen.add(JSON.stringify(await boxes()));
    expect([...seen], where).toEqual([JSON.stringify(before)]);
    await expect(machine(page)).toHaveAttribute('data-won', '12');
    // The tap targets: every bet, START and Skip at least 44 px.
    for (const id of ['bt-start', 'bt-skip', 'bt-bet-1', 'bt-bet-2', 'bt-bet-3', 'bt-bet-5', 'bt-bet-10']) {
      const size = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect());
      expect(Math.min(size.width, size.height), `${where}: ${id}`).toBeGreaterThanOrEqual(44);
    }
    // The Odds tab fits too.
    await page.locator('#bt-tab-odds').click();
    await expect(page.getByTestId('bt-back')).toHaveText('90.00%');
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    await context.close();
  }
});
