import { test, expect, type Browser, type Page } from '@playwright/test';

import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { JP_LAMPS, STAR, numberForFace, numberForLamp, type Draw } from '../../src/components/game/Sugoroku/engine';
import { BOARD_KEY, parseBoard } from '../../src/components/game/Sugoroku/medalTable';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { quietFloor } from './quietFloor';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Whale Isle Sugoroku plays with the medal center's medals and keeps its board. A roll is drawn from six numbers of
// Math.random in the press of ROLL (the die, the whale's three rolls, the lamp, the JP final), so a test that needs a
// roll queues the numbers that draw it (rigPresses.ts). The floor's API answers at once (quietFloor.ts); nothing
// reaches a real server.

test.beforeEach(async ({ context }) => {
  await quietFloor(context);
  // One button after another on a page taller than the window: the page scrolls at once, so no press lands elsewhere.
  await instantScroll(context);
});

const machine = (page: Page) => page.getByTestId('sg-machine');
const STAR_LAMP = JP_LAMPS.indexOf(STAR);

/** The six numbers that draw a roll. */
const numbersFor = ({ roll, ride = [1, 1, 1], lamp = 0, final = 1 }: Partial<Draw> & { roll: number }): number[] => [numberForFace(roll), ...ride.map(numberForFace), numberForLamp(lamp), numberForFace(final)];

async function openBoard(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/sugoroku'))?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const board = async (page: Page) => parseBoard(await page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY));

/** ROLL with the roll drawn as `draw`: pressed again only while no roll has been written down, so never twice. */
async function roll(page: Page, draw: Partial<Draw> & { roll: number }) {
  await rigPresses(page, numbersFor(draw));
  const before = (await board(page))?.roll?.id ?? null;
  await pressUntil(page.getByTestId('sg-roll'), async () => ((await board(page))?.roll?.id ?? null) !== before);
}

/** Waits for the roll's show to end (skipping it), the machine at rest again. */
async function landed(page: Page) {
  if ((await machine(page).getAttribute('data-phase')) !== 'idle') await page.getByTestId('sg-skip').click().catch(() => undefined);
  await expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });
}

/** Takes the focus off the button last pressed: Space or Enter on a focused button presses that button, as anywhere. */
const unfocus = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test('a roll takes the bet once, the lamp chance and the whale ride to the jackpot pay once, and the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  await openBoard(page);
  await expect(page.getByTestId('sg-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('sg-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');
  await expect(machine(page)).toHaveAttribute('data-at', '0');

  // A 6 from START, on a bet of 4: the LAMP CHANCE, its lamps running round to ×10.
  await page.getByTestId('sg-bet-4').click();
  await roll(page, { roll: 6, lamp: 0 });
  // The bet is out of the medals at once; what the roll wins goes in as the boat stops.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 4);
  await expect(machine(page)).toHaveAttribute('data-phase', 'lamp', { timeout: 5_000 });
  await expect(page.getByTestId('sg-lamps')).toHaveAttribute('data-set', 'lamp');
  await expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 15_000 });
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 4 + 40);
  await expect(machine(page)).toHaveAttribute('data-at', '6');
  await expect(machine(page)).toHaveAttribute('data-won', '40');
  await expect(page.getByTestId('sg-status')).toHaveText('6! Lamp Chance, ×10 → +40');
  // The win counts up into the medals' LED and settles on the medals.
  await expect(page.getByTestId('sg-medals-led')).toHaveAttribute('data-shown', String(WELCOME + 36), { timeout: 5_000 });

  // A 6 from the lamp chance on a bet of 10: the whale, 4 and 6 up its back, the blowhole, the JP star and a 6.
  await page.getByTestId('sg-bet-10').click();
  await roll(page, { roll: 6, ride: [4, 6, 5], lamp: STAR_LAMP, final: 6 });
  await expect(machine(page)).toHaveAttribute('data-phase', 'ride', { timeout: 5_000 });
  await expect(page.getByTestId('sg-board')).toHaveAttribute('data-boat', /^lane-/, { timeout: 5_000 });
  // The JP FINAL: the die rolled again for a 6. Skipped from there, the roll ends as it was drawn.
  await expect(page.getByTestId('sg-banner')).toHaveAttribute('data-kind', 'final', { timeout: 20_000 });
  await page.getByTestId('sg-skip').click();
  await expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 2_000 });
  await expect(page.getByTestId('sg-banner')).toHaveText('+1,020');
  await expect(machine(page)).toHaveAttribute('data-won', '1020');
  await expect(machine(page)).toHaveAttribute('data-at', '12');
  expect(await bankBalance(page)).toBe(WELCOME - 4 + 40 - 10 + 1_020);
  await expect(page.getByTestId('sg-history').locator('li').first()).toHaveAttribute('data-jackpot', 'true');

  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText((WELCOME - 4 + 40 - 10 + 1_020).toLocaleString('en-US'));
  await expect(page.getByTestId('center-play-sugoroku')).toHaveAttribute('href', '/games/sugoroku');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-sugoroku')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-sugoroku-rounds')).toHaveText('2');
  await expect(page.getByTestId('mypage-sugoroku-won')).toHaveText('1,060');
});

test('the die is seen tumbling before its face is told: the status line never shows the roll before the die lands', async ({ page }) => {
  await openBoard(page);
  // Every text the status line takes from the press on, and every face the die shows, in order.
  await page.evaluate(() => {
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    const status = document.querySelector('[data-testid="sg-status"]')!;
    const die = document.querySelector('[data-testid="sg-die"]')!;
    const note = () => w.__said.push(`${status.textContent}|${die.getAttribute('data-rolling')}`);
    new MutationObserver(note).observe(status, { subtree: true, childList: true, characterData: true });
    new MutationObserver(note).observe(die, { attributes: true, attributeFilter: ['data-rolling'] });
  });
  await roll(page, { roll: 5 });
  await landed(page);
  const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said);
  // The first thing said is that the die is rolling; "A 5!" comes only once it has stopped tumbling.
  expect(said[0]).toBe('Rolling the die…|true');
  const told = said.findIndex((line) => line.startsWith('A 5!'));
  expect(told).toBeGreaterThan(0);
  expect(said.slice(0, told).every((line) => line.startsWith('Rolling the die…'))).toBe(true);
});

test('the board stays as it was left: a reload in the middle of a whale ride pays it once and finds the boat at the gate', async ({ page }) => {
  test.setTimeout(60_000);
  await openBoard(page);
  await roll(page, { roll: 6, lamp: 4 });
  await landed(page);
  expect(await bankBalance(page)).toBe(WELCOME - 2 + 2);
  // The whale ride: 4 and 6 up its back (2 and 2 a medal), and its JP chance at the blowhole stopping on ×5 (10): reloaded mid-ride.
  await roll(page, { roll: 6, ride: [4, 6, 3], lamp: JP_LAMPS.indexOf(10) });
  await expect(machine(page)).toHaveAttribute('data-phase', 'ride', { timeout: 5_000 });
  const won = (await board(page))!.roll!.won;
  expect(won).toBe(2 + 2 + 10);
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  // Paid as the page went, once; the boat back at the whale's gate, its last roll shown.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2 + 2 - 2 + won);
  await expect(machine(page)).toHaveAttribute('data-at', '12');
  await expect(page.getByTestId('sg-resumed')).toBeVisible();
  expect((await board(page))?.roll).toMatchObject({ paid: true, won });
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME - 2 + 2 - 2 + won);
  // And the next roll sails on from the gate.
  await roll(page, { roll: 2 });
  expect((await board(page))?.at).toBe(12);
  await landed(page);
  await expect(machine(page)).toHaveAttribute('data-at', '14');
});

test('the keys play it, S skips, and the whirlpool sends the boat back to START with no lap bonus', async ({ page }) => {
  test.setTimeout(60_000);
  await openBoard(page);
  await unfocus(page);
  // B changes the bet; Space rolls; S skips.
  await page.keyboard.press('b');
  await expect(page.getByTestId('sg-bet-4')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await expect(page.getByTestId('sg-bet-2')).toHaveAttribute('aria-checked', 'true');
  await rigPresses(page, numbersFor({ roll: 5 }));
  await page.keyboard.press('Space');
  await expect.poll(async () => (await board(page))?.roll?.draw.roll).toBe(5);
  await page.keyboard.press('s');
  await expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 2_000 });
  await expect(machine(page)).toHaveAttribute('data-at', '5');
  // A 6: on over the lamp chance to the shell at 11; then a 4: the whirlpool, back to START.
  await rigPresses(page, numbersFor({ roll: 6 }));
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await board(page))?.at).toBe(5);
  await page.keyboard.press('Enter');
  await expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 2_000 });
  await expect(machine(page)).toHaveAttribute('data-at', '11');
  const before = await bankBalance(page);
  await rigPresses(page, numbersFor({ roll: 4 }));
  await page.keyboard.press('Space');
  await expect.poll(async () => (await board(page))?.at).toBe(11);
  await expect(page.getByTestId('sg-banner')).toHaveAttribute('data-kind', 'arrow', { timeout: 5_000 });
  await landed(page);
  await expect(machine(page)).toHaveAttribute('data-at', '0');
  expect(await bankBalance(page)).toBe(before - 2);
});

/** A phone, in a language, with the floor faked. */
async function phone(browser: Browser, width: number, language: 'en' | 'ja') {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 812 }, isMobile: true, hasTouch: true });
  await quietFloor(context);
  await instantScroll(context);
  const page = await context.newPage();
  await openBoard(page, language);
  return { context, page };
}

test('fits 375 and 320 px phones in English and Japanese: the board and ROLL on screen together, and nothing moves through a roll', async ({ browser }) => {
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
    // Scrolled down to ROLL, as a player who has read the page; ROLL brings the board into view with the button.
    await page.getByTestId('sg-roll').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const boxes = () =>
      page.evaluate(() =>
        ['sg-board', 'sg-status', 'sg-medals-led', 'sg-win-led', 'sg-roll', 'sg-skip', 'sg-sound'].map((id) => {
          const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)}`;
        }),
      );
    const before = await boxes();
    const seen = new Set<string>([JSON.stringify(before)]);
    // A 6 from START: the lamp chance, the longest show a roll from START can have.
    await roll(page, { roll: 6, lamp: 3 });
    const inView = (id: string) =>
      page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= window.innerHeight + 1;
      });
    await expect.poll(() => inView('sg-board'), { message: `${where}: the board` }).toBe(true);
    expect(await inView('sg-roll'), `${where}: ROLL`).toBe(true);
    while ((await machine(page).getAttribute('data-phase')) !== 'idle') {
      seen.add(JSON.stringify(await boxes()));
      expect(await sideways(), where).toBeLessThanOrEqual(width);
      await page.waitForTimeout(120);
    }
    seen.add(JSON.stringify(await boxes()));
    expect([...seen], where).toEqual([JSON.stringify(before)]);
    expect(await inView('sg-board'), `${where}: the board, after`).toBe(true);
    // Everything the board prints (the squares' pays and moves, the whale's back, the lamps of the chance just played),
    // and the legend that names the squares, is at least 11 px: readable on the narrowest phone.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="sg-board"] *, [data-testid="sg-legend"] *')].flatMap((el) => {
        const text = [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '').map((node) => node.textContent!.trim()).join('');
        if (!text || !(el as HTMLElement).checkVisibility({ visibilityProperty: true, opacityProperty: true }) || el.closest('[class*="srOnly"]')) return [];
        const size = parseFloat(getComputedStyle(el).fontSize);
        return size < 10.95 ? [`${text} ${size.toFixed(1)}px`] : [];
      }),
    );
    expect(small, `${where}: text under 11 px`).toEqual([]);
    // The Odds tab fits too.
    await page.locator('#sg-tab-odds').click();
    await expect(page.getByTestId('sg-rtp')).toHaveText('89.74%');
    await expect(page.getByTestId('sg-best')).toHaveText('93.06%');
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    await context.close();
  }
});

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a roll is simply there: no tumble, no hops, no lamps running, and the machine is ready at once', async ({ page }) => {
    await openBoard(page);
    const started = Date.now();
    await roll(page, { roll: 6, lamp: 0 });
    await expect(machine(page)).toHaveAttribute('data-phase', 'idle', { timeout: 1_500 });
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(machine(page)).toHaveAttribute('data-at', '6');
    await expect(page.getByTestId('sg-die')).toHaveAttribute('data-rolling', 'false');
    expect(await page.getByTestId('sg-die').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(page.getByTestId('sg-lamps')).toHaveAttribute('data-lit', '0');
    await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2 + 20);
    await expect(page.getByTestId('sg-roll')).toBeEnabled();
  });
});
