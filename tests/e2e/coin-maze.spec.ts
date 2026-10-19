import { test, expect, type Browser, type Page } from '@playwright/test';

import { numbersFor, type Draw } from '../../src/components/game/CoinMaze/engine';
import { PLAY_KEY, parsePlay } from '../../src/components/game/CoinMaze/medalTable';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { quietFloor } from './quietFloor';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Candy Shop Medal Maze plays with the medal center's medals. Everything random about a play is drawn from twenty
// numbers of Math.random in the press of DROP (engine.ts `drawPlay`), so a test queues the numbers that draw the play it
// needs (rigPresses.ts). A flick is timed: the case says which window a flick now would meet (`data-window`) and how
// the gate stands in it (`data-slot`), and the test flicks the moment the gate stands as it wants. The floor's API
// answers at once (quietFloor.ts); nothing reaches a real server.

test.beforeEach(async ({ context }) => {
  await quietFloor(context);
  // One button after another on a page taller than the window: the page scrolls at once, so no press lands elsewhere.
  await instantScroll(context);
});

const machine = (page: Page) => page.getByTestId('cm-machine');

/**
 * A play drawn so: every gate on its first setting (open at window 1 to 3 or more, shut at 7), the gates' turns
 * starting at window 0, every graze getting through, the blind flicks at window 1 (open), and the pins as given.
 */
const play = (over: Partial<Draw> = {}): Draw => ({ gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [1, 1, 1, 1], pins: [true, true, true, true], ...over });

async function openMaze(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/coin-maze'))?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const record = async (page: Page) => parsePlay(await page.evaluate((key) => window.localStorage.getItem(key), PLAY_KEY));

/** DROP with the play drawn as `draw`: pressed again only while no play has been written down, so never twice. */
async function drop(page: Page, draw: Draw) {
  await rigPresses(page, numbersFor(draw));
  const before = (await record(page))?.id ?? null;
  await pressUntil(page.getByTestId('cm-drop'), async () => ((await record(page))?.id ?? null) !== before);
}

/** Waits for the medal to wait at its next gate. */
const atGate = (page: Page, stage: number) => expect(machine(page)).toHaveAttribute('data-stage', String(stage), { timeout: 10_000 }).then(() => expect(machine(page)).toHaveAttribute('data-phase', 'wait', { timeout: 10_000 }));

/**
 * Flicks the lever the moment a flick would meet the gate standing as `slot` ('open', 'half' or 'shut'): at the start
 * of such a window, so that the press lands well inside it. `how` says whether the lever is clicked, or held with Space
 * and let go. Resolves to the window it flicked in.
 */
async function flickWhen(page: Page, slot: 'open' | 'half' | 'shut', how: 'click' | 'space' = 'click'): Promise<number> {
  return page.evaluate(
    ({ slot, how }) =>
      new Promise<number>((resolve, reject) => {
        const box = document.querySelector('[data-testid="cm-board"]')!;
        const lever = document.querySelector<HTMLButtonElement>('[data-testid="cm-lever"]')!;
        const timer = window.setTimeout(() => reject(new Error(`no ${slot} window in 6 s`)), 6_000);
        const observer = new MutationObserver(() => {
          if (box.getAttribute('data-slot') !== slot) return;
          observer.disconnect();
          window.clearTimeout(timer);
          const at = Number(box.getAttribute('data-window'));
          if (how === 'click') lever.click();
          else {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
            window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
          }
          resolve(at);
        });
        observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
      }),
    { slot, how },
  );
}

/** Waits for the play to have ended, the machine at rest. */
const ended = (page: Page) => expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });

test('a play takes one medal, the lever flicks it through the four gates, the pins pay BIG once, and the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  await openMaze(page);
  await expect(page.getByTestId('cm-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('cm-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');
  await drop(page, play());
  // The medal is out of the medals at once; what the play wins goes in as the medal lands in its pocket.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1);
  for (let stage = 0; stage < 4; stage++) {
    await atGate(page, stage);
    await expect(page.getByTestId('cm-lever')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('cm-status')).toHaveText(`Gate ${stage + 1} of 4: flick when it opens!`);
    // Skip never flicks a lever for the player: it waits for the last one.
    await expect(page.getByTestId('cm-skip')).toBeDisabled();
    const window = await flickWhen(page, 'open');
    // Written down before the medal is seen to fly.
    await expect.poll(async () => (await record(page))?.flicks[stage]).toBe(window);
  }
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-result', 'big');
  await expect(page.getByTestId('cm-status')).toHaveText('BIG WIN! +5');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + 5);
  await expect(page.getByTestId('cm-medals-led')).toHaveAttribute('data-shown', String(WELCOME + 4), { timeout: 5_000 });
  await expect(page.getByTestId('cm-history').locator('li').first()).toHaveAttribute('data-pocket', 'big');
  expect(await record(page)).toMatchObject({ paid: true });

  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText((WELCOME + 4).toLocaleString('en-US'));
  await expect(page.getByTestId('center-play-coin-maze')).toHaveAttribute('href', '/games/coin-maze');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-coin-maze')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-coin-maze-rounds')).toHaveText('1');
  await expect(page.getByTestId('mypage-coin-maze-won')).toHaveText('5');
});

test('the timing is the player’s: a flick into a shut gate drops OUT, Space held and let go flicks, and Skip waits for the last lever and then fast-forwards', async ({ page }) => {
  test.setTimeout(90_000);
  await openMaze(page);
  // Space and Enter press a focused button as anywhere: the keys are the machine's once nothing is focused.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // The line of keys is shown where there are keys: not on a touch screen (an iPhone in WebKit).
  if (await page.evaluate(() => window.matchMedia('(hover: none)').matches)) await expect(page.getByTestId('cm-keys')).toBeHidden();
  else await expect(page.getByTestId('cm-keys')).toBeVisible();
  await rigPresses(page, numbersFor(play()));
  await page.keyboard.press('Enter');
  await atGate(page, 0);
  // Skip waits for the last lever, and says so; S does nothing yet.
  const skip = page.getByTestId('cm-skip');
  await expect(skip).toBeDisabled();
  await expect(skip).toHaveAccessibleDescription('after the last lever');
  await page.keyboard.press('s');
  await page.waitForTimeout(300);
  await expect(machine(page)).toHaveAttribute('data-phase', 'wait');
  expect((await record(page))?.flicks).toEqual([]);
  // Space held and let go: the lever pulled back on its spring, then the flick.
  await flickWhen(page, 'open', 'space');
  await atGate(page, 1);
  await flickWhen(page, 'shut');
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-result', 'out-2');
  await expect(page.getByTestId('cm-status')).toHaveText('OUT at gate 2: the gate was shut');
  expect(await bankBalance(page)).toBe(WELCOME - 1);
  expect((await record(page))?.flicks).toHaveLength(2);

  // Four flicks, and then Skip: the medal's way through the pins (right, right, left, left) is cut short, and it lands
  // where it was going. No lever was flicked for the player: the four windows are the ones flicked.
  await drop(page, play({ pins: [true, true, false, false] }));
  const flicked: number[] = [];
  for (let stage = 0; stage < 4; stage++) {
    await atGate(page, stage);
    flicked.push(await flickWhen(page, 'open'));
  }
  await expect(skip).toBeEnabled();
  await page.keyboard.press('s');
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-result', 'win');
  expect(await record(page)).toMatchObject({ flicks: flicked, paid: true });
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2 + 2);
  await expect(skip).toBeDisabled();
});

test('a reload in the middle of a play finds the same play, finishes it with the flicks made and the rest blind, and pays it once', async ({ page }) => {
  test.setTimeout(60_000);
  await openMaze(page);
  // Every blind flick drawn open, and the pins all right: finished blind, the play reaches the BIG WIN pocket.
  await drop(page, play());
  await atGate(page, 0);
  const first = await flickWhen(page, 'open');
  await atGate(page, 1);
  const id = (await record(page))!.id;
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  // Finished as the page went (or as it came back): the flick made, then blind at window 1, into the BIG WIN pocket.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + 5);
  expect(await record(page)).toMatchObject({ id, flicks: [first, 1, 1, 1], paid: true });
  await expect(page.getByTestId('cm-resumed')).toBeVisible();
  // The badge is not laid over the plate that says what a play takes (both sat at the top of the case).
  const overlap = await page.evaluate(() => {
    const badge = document.querySelector('[data-testid="cm-resumed"]')!.getBoundingClientRect();
    const plate = document.querySelector('[data-testid="cm-board"] [class*="perPlay"]')!.getBoundingClientRect();
    return badge.left < plate.right && plate.left < badge.right && badge.top < plate.bottom && plate.top < badge.bottom;
  });
  expect(overlap).toBe(false);
  await expect(machine(page)).toHaveAttribute('data-result', 'big');
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME - 1 + 5);
  // And the next play goes on as ever.
  await drop(page, play());
  await atGate(page, 0);
  await flickWhen(page, 'shut');
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-result', 'out-1');
  expect(await bankBalance(page)).toBe(WELCOME - 2 + 5);
});

/** A phone, in a language, with the floor faked. */
async function phone(browser: Browser, width: number, language: 'en' | 'ja') {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 812 }, isMobile: true, hasTouch: true });
  await quietFloor(context);
  await instantScroll(context);
  const page = await context.newPage();
  await openMaze(page, language);
  return { context, page };
}

test('fits 375 and 320 px phones in English and Japanese: the case and the lever on screen together, and nothing moves through a play', async ({ browser }) => {
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
    // Scrolled down to DROP, as a player who has read the page; DROP brings the case into view with the lever.
    await page.getByTestId('cm-drop').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const boxes = () =>
      page.evaluate(() =>
        ['cm-board', 'cm-status', 'cm-medals-led', 'cm-win-led', 'cm-drop', 'cm-lever', 'cm-skip', 'cm-message', 'cm-sound'].map((id) => {
          const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)} ${Math.round(box.left)} ${Math.round(box.width)}`;
        }),
      );
    const before = await boxes();
    const seen = new Set<string>([JSON.stringify(before)]);
    await drop(page, play({ pins: [true, true, false, false] }));
    // On screen together, under the site's toolbar: the whole case and the lever.
    const inView = (id: string) =>
      page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('[class*="GlobalToolbar"]')?.getBoundingClientRect().bottom ?? 0;
        return r.top >= bar - 1 && r.bottom <= window.innerHeight + 1;
      });
    await expect.poll(() => inView('cm-board'), { message: `${where}: the case` }).toBe(true);
    expect(await inView('cm-lever'), `${where}: the lever`).toBe(true);
    for (let stage = 0; stage < 4; stage++) {
      await atGate(page, stage);
      seen.add(JSON.stringify(await boxes()));
      await flickWhen(page, 'open');
      seen.add(JSON.stringify(await boxes()));
      expect(await sideways(), where).toBeLessThanOrEqual(width);
    }
    while ((await machine(page).getAttribute('data-phase')) !== 'idle') {
      seen.add(JSON.stringify(await boxes()));
      await page.waitForTimeout(120);
    }
    seen.add(JSON.stringify(await boxes()));
    expect([...seen], where).toEqual([JSON.stringify(before)]);
    await expect(machine(page)).toHaveAttribute('data-result', 'win');
    // Everything the case prints (the pockets, OUT, the gates' numbers, the plate that says what a play takes) is at
    // least 11 px: readable on the narrowest phone.
    const small = await page.evaluate(() => [
      ...[...document.querySelectorAll('[data-testid="cm-board"] text')].flatMap((el) => {
        const size = el.getBoundingClientRect().height;
        return size > 0 && size < 10.5 ? [`${el.textContent} ${size.toFixed(1)}px`] : [];
      }),
      ...[...document.querySelectorAll<HTMLElement>('[data-testid="cm-board"] span')].flatMap((el) => {
        const size = parseFloat(getComputedStyle(el).fontSize);
        return el.textContent?.trim() && size < 10.95 ? [`${el.textContent} ${size.toFixed(1)}px`] : [];
      }),
    ]);
    expect(small, `${where}: text under 11 px`).toEqual([]);
    // The tap targets: DROP, the lever and Skip at least 44 px.
    for (const id of ['cm-drop', 'cm-lever', 'cm-skip']) {
      const size = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect());
      expect(Math.min(size.width, size.height), `${where}: ${id}`).toBeGreaterThanOrEqual(44);
    }
    // The Odds tab fits too.
    await page.locator('#cm-tab-odds').click();
    await expect(page.getByTestId('cm-perfect')).toHaveText('92.53%');
    await expect(page.getByTestId('cm-typical')).toHaveText('75.81%');
    await expect(page.getByTestId('cm-blind')).toHaveText('4.97%');
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    await context.close();
  }
});

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the medal is simply put in place; the machine waits while its Odds tab is open; and a medal left in its cup too long drops OUT', async ({ page }) => {
    test.setTimeout(75_000);
    await openMaze(page);
    const started = Date.now();
    await drop(page, play());
    // No roll down the shelf: it is in the first cup at once.
    await atGate(page, 0);
    expect(Date.now() - started).toBeLessThan(5_000);
    await flickWhen(page, 'open');
    await atGate(page, 1);
    // A look at the odds, longer than the time limit: the machine waits, its lamps as they were, and goes on after.
    const lamps = page.getByTestId('cm-board').locator('g[data-stage="1"] g[data-lit]');
    const lit = await lamps.getAttribute('data-lit');
    await page.locator('#cm-tab-odds').click();
    await page.waitForTimeout(8_000);
    await page.locator('#cm-tab-machine').click();
    await expect(machine(page)).toHaveAttribute('data-phase', 'wait');
    await expect(machine(page)).toHaveAttribute('data-stage', '1');
    expect(await lamps.getAttribute('data-lit')).toBe(lit);
    expect((await record(page))?.flicks).toHaveLength(1);
    // Three turns of its gate, 7.2 s, and it drops through the cup into the OUT hole.
    await expect(machine(page)).toHaveAttribute('data-result', 'out-2', { timeout: 12_000 });
    await expect(page.getByTestId('cm-status')).toHaveText('OUT at gate 2: time ran out');
    expect((await record(page))?.flicks[1]).toBe(8);
    expect(await bankBalance(page)).toBe(WELCOME - 1);
    await expect(page.getByTestId('cm-drop')).toBeEnabled();
  });
});
