import { test, expect, type Browser, type Page } from './fixtures';

import { MARBLES, numbersFor, slotFor, type Draw, type Entry } from '../../src/components/game/SmartBall/engine';
import { PLAY_KEY, parsePlay } from '../../src/components/game/SmartBall/medalTable';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Hot Spring Smart Ball (smart-ball) plays with the medal center's medals. Everything random about a play is drawn from
// twenty numbers of Math.random in the press of START (engine.ts `drawPlay`), so a test queues the numbers that draw
// the play it needs (rigPresses.ts). A shot is a hold of the plunger: the board says which strength a release now would
// shoot at (`data-window`), and the test lets go the moment it is the one it wants. The floor's API answers at once
// (fixtures.ts); nothing reaches a real server.

test.beforeEach(async ({ context }) => {
  // One button after another on a page taller than the window: the page scrolls at once, so no press lands elsewhere.
  await instantScroll(context);
});

const machine = (page: Page) => page.getByTestId('smb-machine');
const STAKE = 5;
/** Every shot here is at the middle strength (3 here, shown as 4), which reaches every column. */
const AIM = 3;
const at = (row: number, col: number): Entry => ({ row, col });
/** A play drawn so: marble `m`, shot at the middle strength, drops at `entries[m]` (OUT for the rest); blind shots at `blinds`. */
const play = (entries: (Entry | null)[], blinds: number[] = Array.from({ length: MARBLES }, () => AIM)): Draw => ({
  drops: Array.from({ length: MARBLES }, (_, m) => slotFor(AIM, m < entries.length ? entries[m] : null)),
  blinds,
});
/** The top row, the left-hand column and the diagonal from the top right: three lines, 100 medals. */
const TRIPLE = play([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(1, 0), at(2, 0), at(3, 0), at(1, 2), at(2, 1)]);

async function openTable(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/smart-ball'))?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const record = async (page: Page) => parsePlay(await page.evaluate((key) => window.localStorage.getItem(key), PLAY_KEY));

/** START with the play drawn as `draw`: pressed again only while no play has been written down, so never twice. */
async function start(page: Page, draw: Draw) {
  await rigPresses(page, numbersFor(draw));
  const before = (await record(page))?.id ?? null;
  await pressUntil(page.getByTestId('smb-start'), async () => ((await record(page))?.id ?? null) !== before);
}

/** Waits for marble `m` to be on the plunger. */
const onPlunger = (page: Page, m: number) =>
  expect(machine(page))
    .toHaveAttribute('data-marble', String(m), { timeout: 10_000 })
    .then(() => expect(machine(page)).toHaveAttribute('data-phase', 'aim', { timeout: 10_000 }));

/**
 * Holds the plunger and lets go the moment the board says a release would shoot at `strength` ('weak': too soft to
 * reach the rail). `how`: by the pointer on the plunger, or by Space held and let go.
 */
async function shoot(page: Page, strength: number | 'weak', how: 'pointer' | 'space' = 'pointer'): Promise<void> {
  await page.evaluate(
    ({ strength, how }) =>
      new Promise<void>((resolve, reject) => {
        const box = document.querySelector('[data-testid="smb-board"]')!;
        const plunger = document.querySelector<HTMLButtonElement>('[data-testid="smb-plunger"]')!;
        const timer = window.setTimeout(() => reject(new Error(`strength ${strength} never came in 6 s`)), 6_000);
        const press = (down: boolean) => {
          if (how === 'pointer') plunger.dispatchEvent(new PointerEvent(down ? 'pointerdown' : 'pointerup', { pointerId: 11, isPrimary: true, button: 0, bubbles: true }));
          else window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: ' ', bubbles: true, cancelable: true }));
        };
        const observer = new MutationObserver(() => {
          if (box.getAttribute('data-window') !== String(strength)) return;
          observer.disconnect();
          window.clearTimeout(timer);
          press(false);
          resolve();
        });
        observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
        press(true);
      }),
    { strength, how },
  );
}

/** Shoots marbles `from` to the last at the middle strength, each once it is on the plunger. */
async function shootAll(page: Page, from = 0) {
  for (let m = from; m < MARBLES; m++) {
    await onPlunger(page, m);
    await shoot(page, AIM);
  }
}

/** Waits for the play to have ended, the machine at rest. */
const ended = (page: Page) => expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });

test('smart-ball: a play takes five medals, the plunger shoots ten marbles, three lines pay 100 once, and the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  // The page is drawn the same by the server and the browser: the rail's lamps once differed in their last digits.
  const mismatches: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) mismatches.push(message.text().slice(0, 200));
  });
  await openTable(page);
  await expect(page.getByTestId('smb-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('smb-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');
  await start(page, TRIPLE);
  // The medals are out of the medals at once; what the lines win goes in as the last marble comes to rest.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE);
  for (let m = 0; m < MARBLES; m++) {
    await onPlunger(page, m);
    await expect(page.getByTestId('smb-plunger')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('smb-status')).toContainText(`Marble ${m + 1} of 10`);
    // Skip never shoots a marble for the player: it waits for the last one.
    await expect(page.getByTestId('smb-skip')).toBeDisabled();
    await shoot(page, AIM);
    // Written down before the marble is seen to fly.
    await expect.poll(async () => (await record(page))?.shots.length).toBe(m + 1);
  }
  await ended(page);
  await expect(machine(page)).toHaveAttribute('data-result', 'lines-3');
  await expect(page.getByTestId('smb-status')).toHaveText('TRIPLE BINGO! +100');
  await expect(page.getByTestId('smb-holes').locator('[data-lit="true"]')).toHaveCount(9);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE + 100);
  await expect(page.getByTestId('smb-medals-led')).toHaveAttribute('data-shown', String(WELCOME + 95), { timeout: 8_000 });
  await expect(page.getByTestId('smb-history').locator('li').first()).toHaveAttribute('data-lines', '3');
  expect(await record(page)).toMatchObject({ paid: true, shots: Array.from({ length: MARBLES }, () => AIM) });
  expect(mismatches).toEqual([]);

  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText((WELCOME + 95).toLocaleString('en-US'));
  await expect(page.getByTestId('center-play-smart-ball')).toHaveAttribute('href', '/games/smart-ball');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-smart-ball')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-smart-ball-rounds')).toHaveText('1');
  await expect(page.getByTestId('mypage-smart-ball-won')).toHaveText('100');
});

test('smart-ball: the pull is the player’s: too soft rolls back unshot, Space held and let go shoots, and Skip waits for the last marble, then fast-forwards', async ({ page }) => {
  test.setTimeout(90_000);
  await openTable(page);
  // Space and Enter press a focused button as anywhere: the keys are the machine's once nothing is focused.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  if (await page.evaluate(() => window.matchMedia('(hover: none)').matches)) await expect(page.getByTestId('smb-keys')).toBeHidden();
  else await expect(page.getByTestId('smb-keys')).toBeVisible();
  // The top row and the bottom row: two lines, 20.
  await rigPresses(page, numbersFor(play([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(3, 0), at(3, 1), at(3, 2), at(3, 3)])));
  await page.keyboard.press('Enter');
  await onPlunger(page, 0);
  const skip = page.getByTestId('smb-skip');
  await expect(skip).toBeDisabled();
  await expect(skip).toHaveAccessibleDescription('after the last marble');
  await page.keyboard.press('s');
  // Too soft: the marble rolls back down the lane, and nothing is written.
  await shoot(page, 'weak');
  await expect(page.getByTestId('smb-status')).toHaveText('Too soft: it rolled back. Shoot it again.');
  await onPlunger(page, 0);
  expect((await record(page))?.shots).toEqual([]);
  // Space held and let go: the plunger drawn back on its spring, then the shot, at the strength it was let go at.
  await shoot(page, AIM, 'space');
  await expect.poll(async () => (await record(page))?.shots).toEqual([AIM]);
  // A softer pull sends the next marble elsewhere: the player's own strength is written down.
  await onPlunger(page, 1);
  await shoot(page, 1);
  await expect.poll(async () => (await record(page))?.shots).toEqual([AIM, 1]);
  await shootAll(page, 2);
  await expect(skip).toBeEnabled();
  await page.keyboard.press('s');
  await ended(page);
  // The second marble, shot softer, missed the top row: the bottom row alone is a line.
  await expect(machine(page)).toHaveAttribute('data-result', 'lines-1');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE + 7);
  await expect(skip).toBeDisabled();
});

test('smart-ball: Space held down to draw the plunger keeps the page where it is, its repeats and all', async ({ page }) => {
  test.setTimeout(60_000);
  await openTable(page);
  // The keys are the machine's once nothing is focused.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await rigPresses(page, numbersFor(play([at(0, 0)])));
  await page.keyboard.press('Enter');
  await onPlunger(page, 0);
  // START has brought the board into view; the page goes on below it.
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.scrollY);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight - window.scrollY)).toBeGreaterThan(200);
  await page.keyboard.down(' ');
  await expect(page.getByTestId('smb-plunger')).toHaveAttribute('data-pulled', 'true');
  // A key held down repeats, a keydown each time (Playwright sends a repeat for a key already down). Each one used to
  // scroll the page a screen down, the board with it, while the player held the plunger.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.down(' ');
    await page.waitForTimeout(30);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await page.keyboard.up(' ');
  await expect.poll(async () => (await record(page))?.shots.length).toBe(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('smart-ball: a reload in the middle of a play finds the same play, finishes it with the shots made and the rest blind, and pays it once', async ({ page }) => {
  test.setTimeout(60_000);
  await openTable(page);
  await start(page, TRIPLE);
  await onPlunger(page, 0);
  await shoot(page, AIM);
  await onPlunger(page, 1);
  const id = (await record(page))!.id;
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  // Finished as the page went (or as it came back): the shot made, then blind at the middle strength: three lines.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - STAKE + 100);
  expect(await record(page)).toMatchObject({ id, shots: Array.from({ length: MARBLES }, () => AIM), paid: true });
  await expect(page.getByTestId('smb-resumed')).toBeVisible();
  await expect(machine(page)).toHaveAttribute('data-result', 'lines-3');
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME - STAKE + 100);
  // And the next play goes on as ever.
  await start(page, play([]));
  await onPlunger(page, 0);
  expect(await bankBalance(page)).toBe(WELCOME - 2 * STAKE + 100);
});

test('smart-ball: a play finished while the player was away says so when they come back: the marbles left were shot blind', async ({ context, page }) => {
  test.setTimeout(60_000);
  await openTable(page);
  // Every blind shot at the softest strength, which never reaches the top row's last holes: no line.
  await start(page, play([at(0, 0), at(0, 1), at(0, 2), at(0, 3)], Array.from({ length: MARBLES }, () => 0)));
  await onPlunger(page, 0);
  await shoot(page, AIM);
  await onPlunger(page, 1);
  await expect(page.getByTestId('smb-message')).toHaveText('');
  // The medals are played in another tab: this page gives them up, and finishes its play first.
  const other = await context.newPage();
  await other.goto('/games/smart-ball');
  await arrived(other);
  await expect(other.getByTestId('smb-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect.poll(async () => (await record(other))?.paid).toBe(true);
  expect((await record(other))?.shots).toEqual([AIM, ...Array.from({ length: MARBLES - 1 }, () => 0)]);
  await other.close();
  await page.bringToFront();
  await page.getByTestId('smb-play-here').click();
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(machine(page)).toHaveAttribute('data-result', 'lines-0');
  await expect(page.getByTestId('smb-message')).toHaveText('The play was finished while you were away: the marbles left were shot blind.');
  expect(await bankBalance(page)).toBe(WELCOME - STAKE);
  // The next play clears it.
  await start(page, play([]));
  await expect(page.getByTestId('smb-message')).toHaveText('');
});

/** A phone, in a language, with the floor faked; with less motion asked for when `calm`. */
async function phone(browser: Browser, width: number, language: 'en' | 'ja', calm: boolean) {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 812 }, isMobile: true, hasTouch: true, reducedMotion: calm ? 'reduce' : 'no-preference' });
  await instantScroll(context);
  const page = await context.newPage();
  await openTable(page, language);
  return { context, page };
}

test('smart-ball fits 375 and 320 px phones in English and Japanese: the board and the plunger on screen together, and nothing moves through a play', async ({ browser }) => {
  test.setTimeout(180_000);
  // Two of the four with the marbles moving (the widest in English, the narrowest in Japanese), two with less motion,
  // which lays the page out the same and plays in a few seconds.
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
    // Scrolled down to START, as a player who has read the page; START brings the board on screen with the plunger.
    await page.getByTestId('smb-start').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const boxes = () =>
      page.evaluate(() =>
        ['smb-board', 'smb-status', 'smb-start', 'smb-skip', 'smb-plunger', 'smb-medals-led', 'smb-win-led', 'smb-message', 'smb-sound'].map((id) => {
          const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)} ${Math.round(box.left)} ${Math.round(box.width)}`;
        }),
      );
    const before = await boxes();
    const seen = new Set<string>([JSON.stringify(before)]);
    await start(page, TRIPLE);
    const inView = (id: string) =>
      page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('[class*="GlobalToolbar"]')?.getBoundingClientRect().bottom ?? 0;
        return r.top >= bar - 1 && r.bottom <= window.innerHeight + 1;
      });
    await expect.poll(() => inView('smb-board'), { message: `${where}: the board` }).toBe(true);
    expect(await inView('smb-plunger'), `${where}: the plunger`).toBe(true);
    for (let m = 0; m < MARBLES; m++) {
      await onPlunger(page, m);
      seen.add(JSON.stringify(await boxes()));
      await shoot(page, AIM);
      seen.add(JSON.stringify(await boxes()));
      expect(await sideways(), where).toBeLessThanOrEqual(width);
    }
    await ended(page);
    seen.add(JSON.stringify(await boxes()));
    expect([...seen], where).toEqual([JSON.stringify(before)]);
    await expect(machine(page)).toHaveAttribute('data-result', 'lines-3');
    // Everything the board prints (the holes' numbers, the rail's lamps, the plate, OUT) is at least 11 px: readable on
    // the narrowest phone.
    const small = await page.evaluate(() => [
      ...[...document.querySelectorAll('[data-testid="smb-board"] text')].flatMap((el) => {
        const size = el.getBoundingClientRect().height;
        return size > 0 && size < 10.5 ? [`${el.textContent} ${size.toFixed(1)}px`] : [];
      }),
      ...[...document.querySelectorAll<HTMLElement>('[data-testid="smb-board"] span')].flatMap((el) => {
        const size = parseFloat(getComputedStyle(el).fontSize);
        return el.textContent?.trim() && size < 10.95 ? [`${el.textContent} ${size.toFixed(1)}px`] : [];
      }),
    ]);
    expect(small, `${where}: text under 11 px`).toEqual([]);
    // The tap targets: START, Skip and the plunger at least 44 px; START's words inside its border.
    for (const id of ['smb-start', 'smb-skip', 'smb-plunger']) {
      const size = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect());
      expect(Math.min(size.width, size.height), `${where}: ${id}`).toBeGreaterThanOrEqual(44);
    }
    for (const [id, words] of [
      ['smb-start', 'startWords'],
      ['smb-plunger', 'plungerWords'],
    ] as const) {
      const clear = await page.getByTestId(id).evaluate((button, words) => {
        const inner = button.querySelector(`[class*="${words}"]`)!.getBoundingClientRect();
        const box = button.getBoundingClientRect();
        const border = parseFloat(getComputedStyle(button).borderLeftWidth);
        return Math.min(inner.left - box.left - border, box.right - border - inner.right);
      }, words);
      expect(clear, `${where}: ${id}'s words inside its border`).toBeGreaterThanOrEqual(2);
    }
    // The Odds tab fits too.
    await page.locator('#smb-tab-odds').click();
    await expect(page.getByTestId('smb-perfect')).toHaveText('93.46%');
    await expect(page.getByTestId('smb-typical')).toHaveText('77.80%');
    await expect(page.getByTestId('smb-blind')).toHaveText('32.62%');
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    await context.close();
  }
});

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('smart-ball: the marble is simply put in its hole; the machine waits while its Odds tab is open, and a plunger held as it opened is let go unshot', async ({ page }) => {
    test.setTimeout(60_000);
    await openTable(page);
    const started = Date.now();
    await start(page, TRIPLE);
    await onPlunger(page, 0);
    await shoot(page, AIM);
    // No run round the rail: the marble is in its hole, and the next on the plunger, at once.
    await onPlunger(page, 1);
    expect(Date.now() - started).toBeLessThan(6_000);
    await expect(page.getByTestId('smb-holes').locator('[data-hole="0"]')).toHaveAttribute('data-lit', 'true');
    // The plunger taken hold of, and the Odds tab opened before it is let go: the hold is dropped, nothing is shot.
    await page.getByTestId('smb-plunger').dispatchEvent('pointerdown', { pointerId: 12, isPrimary: true, button: 0 });
    await expect(page.getByTestId('smb-plunger')).toHaveAttribute('data-pulled', 'true');
    await page.locator('#smb-tab-odds').click();
    await page.waitForTimeout(1_500);
    await page.getByTestId('smb-plunger').dispatchEvent('pointerup', { pointerId: 12, isPrimary: true, button: 0 });
    await page.locator('#smb-tab-machine').click();
    await expect(machine(page)).toHaveAttribute('data-phase', 'aim');
    await expect(machine(page)).toHaveAttribute('data-marble', '1');
    await expect(page.getByTestId('smb-plunger')).toHaveAttribute('data-pulled', 'false');
    expect((await record(page))?.shots).toEqual([AIM]);
    // And the play goes on from there.
    await shootAll(page, 1);
    await ended(page);
    await expect(machine(page)).toHaveAttribute('data-result', 'lines-3');
  });
});
