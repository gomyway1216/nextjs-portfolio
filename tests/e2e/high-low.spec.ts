import { test, expect, type Browser, type Page } from '@playwright/test';

import { DECK, TOP, payFor, type Card } from '../../src/components/game/HighLow/engine';
import { ROUND_KEY, parseRound } from '../../src/components/game/HighLow/medalTable';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { quietFloor } from './quietFloor';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// The High & Low Ladder plays with the medal center's medals. Every card is drawn from a fresh 52-card deck with one
// number from Math.random, in the press that turns it (START for the first card, HIGH or LOW for each next one), so a
// test that needs a card queues its number for that press (rigPresses.ts). The floor's API answers at once
// (quietFloor.ts); nothing reaches a real server.

test.beforeEach(async ({ context }) => quietFloor(context));

/** A card of a rank (0 for a 2 up to 12 for an ace), in a suit, and the number that draws it. */
const card = (rank: number, suit = 0): Card => rank * 4 + suit;
const drawing = (c: Card): number => (c + 0.5) / DECK;

const machine = (page: Page) => page.getByTestId('hl-machine');

async function openLadder(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/high-low'))?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const round = async (page: Page) => parseRound(await page.evaluate((key) => window.localStorage.getItem(key), ROUND_KEY));

/** START with the first card drawn as `first`: pressed again only while no game has begun, so never twice. */
async function start(page: Page, first: Card) {
  await rigPresses(page, [drawing(first)]);
  const before = (await round(page))?.id ?? null;
  await pressUntil(page.getByTestId('hl-start'), async () => ((await round(page))?.id ?? null) !== before);
}

/** HIGH or LOW with the next card drawn as `next`, and the card left to land on the screen. */
async function guess(page: Page, side: 'high' | 'low', next: Card) {
  await rigPresses(page, [drawing(next)]);
  const before = (await round(page))?.cards.length ?? 0;
  await page.getByTestId(`hl-${side}`).click();
  await expect.poll(async () => (await round(page))?.cards.length ?? 0).toBe(before + 1);
  await expect(machine(page)).toHaveAttribute('data-show', 'rest', { timeout: 5_000 });
}

/** Takes the focus off the button last pressed: Space or Enter on a focused button presses that button, as anywhere. */
const unfocus = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test('a game takes the bet at START, climbs on right guesses and TAKE pays the rung once; the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  await openLadder(page);
  await expect(page.getByTestId('hl-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('hl-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');

  await page.getByTestId('hl-bet-10').click();
  await expect(page.getByTestId('hl-bet-10')).toHaveAttribute('aria-checked', 'true');
  await start(page, card(5, 1));
  // The bet is out of the medals at once; the first card turns up, the 7 of hearts.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 10);
  await expect(page.getByTestId('hl-card')).toHaveAttribute('aria-label', '7 of hearts');
  await expect(page.getByTestId('hl-status')).toHaveText('Will the next card be higher or lower than the 7?');
  await expect(page.getByTestId('hl-high')).toContainText('7 in 13');
  await expect(page.getByTestId('hl-take')).toBeDisabled();

  // HIGH: the King turns over. While it turns, nothing on the machine gives it away: what the screen shows as the turn
  // begins is noted in the page, as it changes.
  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="hl-machine"]')!;
    const w = window as unknown as { __turn?: Record<string, string | null> };
    new MutationObserver(() => {
      if (w.__turn || target.getAttribute('data-show') !== 'turn') return;
      const at = (id: string, name: string) => document.querySelector(`[data-testid="${id}"]`)!.getAttribute(name);
      w.__turn = { next: at('hl-next', 'aria-label'), take: document.querySelector('[data-testid="hl-take"]')!.textContent, lit: at('hl-ladder', 'data-lit'), high: document.querySelector('[data-testid="hl-high"]')!.textContent };
    }).observe(target, { attributes: true, attributeFilter: ['data-show'] });
  });
  await rigPresses(page, [drawing(card(11))]);
  await page.getByTestId('hl-high').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __turn?: unknown }).__turn ?? null)).toEqual({ next: 'Face down', take: 'TAKE', lit: '0', high: '▲ HIGH7 in 13' });
  await expect(machine(page)).toHaveAttribute('data-show', 'rest', { timeout: 5_000 });
  await expect(page.getByTestId('hl-ladder')).toHaveAttribute('data-lit', '1');
  await expect(page.getByTestId('hl-card')).toHaveAttribute('aria-label', 'King of spades');
  await expect(page.getByTestId('hl-take')).toHaveText(`TAKE ${payFor(10, 1)}`);
  // LOW from the King: a 4.
  await guess(page, 'low', card(2, 3));
  await expect(page.getByTestId('hl-ladder')).toHaveAttribute('data-lit', '2');
  expect(await bankBalance(page)).toBe(WELCOME - 10);

  await page.getByTestId('hl-take').click();
  await expect(machine(page)).toHaveAttribute('data-state', 'taken');
  await expect(machine(page)).toHaveAttribute('data-won', String(payFor(10, 2)));
  await expect(page.getByTestId('hl-status')).toHaveText('Taken: 16 medals!');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 10 + 16);
  // The win counts up into the medals' LED and settles on the medals.
  await expect(page.getByTestId('hl-medals-led')).toHaveAttribute('data-shown', String(WELCOME + 6), { timeout: 5_000 });
  expect((await round(page))?.taken).toBe(true);
  await expect(page.getByTestId('hl-start')).toBeEnabled();

  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME + 6));
  await expect(page.getByTestId('center-play-high-low')).toHaveAttribute('href', '/games/high-low');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-high-low')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-high-low-rounds')).toHaveText('1');
  await expect(page.getByTestId('mypage-high-low-won')).toHaveText('16');
});

test('a tie loses, a loss is written down before its card shows, and a reload finds it lost: no free retry', async ({ page }) => {
  test.setTimeout(60_000);
  await openLadder(page);
  await start(page, card(6));
  // An 8, then another 8: a tie, which loses whichever side was called.
  await guess(page, 'high', card(6, 2));
  await expect(machine(page)).toHaveAttribute('data-state', 'lost');
  await expect(page.getByTestId('hl-status')).toHaveText('Another 8: a tie loses. The ladder is gone.');
  await expect(page.getByTestId('hl-banner')).toHaveText('MISS');
  expect(await bankBalance(page)).toBe(WELCOME - 5);
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(machine(page)).toHaveAttribute('data-state', 'lost');
  await expect(page.getByTestId('hl-start')).toBeEnabled();
  await expect(page.getByTestId('hl-high')).toHaveCount(0);
  expect(await bankBalance(page)).toBe(WELCOME - 5);
  // The next START is a new game, with a bet of its own.
  await start(page, card(0));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 10);
  await guess(page, 'low', card(9));
  await expect(machine(page)).toHaveAttribute('data-state', 'lost');
  await expect(page.getByTestId('hl-status')).toHaveText('It was a Jack: wrong this time. The ladder is gone.');
});

test('a ladder begun stays begun: a reload, or another tab, finds the same card and rung, and goes on from them', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openLadder(page);
  await start(page, card(1));
  await guess(page, 'high', card(10));
  await guess(page, 'low', card(4));
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('hl-resumed')).toBeVisible();
  await expect(machine(page)).toHaveAttribute('data-rung', '2');
  await expect(page.getByTestId('hl-card')).toHaveAttribute('aria-label', '6 of spades');
  await expect(page.getByTestId('hl-take')).toHaveText(`TAKE ${payFor(5, 2)}`);
  expect(await bankBalance(page)).toBe(WELCOME - 5);
  // Another tab takes the medals: it finds the same game, and plays it on.
  const other = await context.newPage();
  await openLadder(other);
  await expect(machine(other)).toHaveAttribute('data-rung', '2');
  await expect(other.getByTestId('hl-card')).toHaveAttribute('aria-label', '6 of spades');
  await guess(other, 'high', card(12));
  await other.getByTestId('hl-take').click();
  await expect.poll(() => bankBalance(other)).toBe(WELCOME - 5 + payFor(5, 3));
  // Back in the first tab, which stood paused: the game is over, as the other tab left it, and nothing is taken twice.
  await page.bringToFront();
  await page.getByTestId('hl-play-here').click();
  await expect(machine(page)).toHaveAttribute('data-state', 'taken', { timeout: 10_000 });
  await expect(page.getByTestId('hl-start')).toBeEnabled();
  expect(await bankBalance(page)).toBe(WELCOME - 5 + payFor(5, 3));
  await other.close();
});

test('the keys play it, S skips a card turning, and twelve right guesses reach the top, paid at once', async ({ page }) => {
  test.setTimeout(90_000);
  await openLadder(page);
  // B changes the bet; Space starts.
  await unfocus(page);
  await page.keyboard.press('b');
  await expect(page.getByTestId('hl-bet-10')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await expect(page.getByTestId('hl-bet-5')).toHaveAttribute('aria-checked', 'true');
  await rigPresses(page, [drawing(card(0))]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await round(page))?.cards).toEqual([card(0)]);
  // H on each card from 2 up: every one right, each card skipped to its end with S.
  for (let rank = 1; rank <= TOP; rank++) {
    await expect(machine(page)).toHaveAttribute('data-show', 'rest', { timeout: 5_000 });
    await rigPresses(page, [drawing(card(rank, rank % 4))]);
    await page.keyboard.press('h');
    await expect.poll(async () => (await round(page))?.cards.length).toBe(rank + 1);
    await page.keyboard.press('s');
  }
  await expect(machine(page)).toHaveAttribute('data-state', 'top', { timeout: 5_000 });
  await expect(machine(page)).toHaveAttribute('data-won', String(payFor(5, TOP)));
  await expect(page.getByTestId('hl-banner')).toHaveText('TOP!');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 5 + 200);
  // T takes: a new game, one right guess, T.
  await unfocus(page);
  await rigPresses(page, [drawing(card(11))]);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await round(page))?.cards).toEqual([card(11)]);
  // The first card turns up; HIGH and LOW wait for it.
  await expect(machine(page)).toHaveAttribute('data-show', 'rest', { timeout: 5_000 });
  await rigPresses(page, [drawing(card(3))]);
  await page.keyboard.press('l');
  await expect.poll(async () => (await round(page))?.cards.length).toBe(2);
  await expect(machine(page)).toHaveAttribute('data-show', 'rest', { timeout: 5_000 });
  await page.keyboard.press('t');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 5 + 200 - 5 + 6);
});

/** A phone, in a language, with the floor faked. */
async function phone(browser: Browser, width: number, language: 'en' | 'ja') {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 812 }, isMobile: true, hasTouch: true });
  await quietFloor(context);
  const page = await context.newPage();
  await openLadder(page, language);
  return { context, page };
}

test('fits 375 and 320 px phones in English and Japanese: the card and HIGH, LOW and TAKE on screen together, and nothing moves through a game', async ({ browser }) => {
  test.setTimeout(120_000);
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
    // Scrolled down to START, as a player who has read the page; START lifts the cards into view with the buttons.
    await page.getByTestId('hl-start').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const boxes = () =>
      page.evaluate(() =>
        ['hl-ladder', 'hl-cards', 'hl-status', 'hl-medals-led', 'hl-skip', 'hl-sound'].map((id) => {
          const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)}`;
        }),
      );
    const before = await boxes();
    const controls = await page.locator('[data-mode]').evaluate((el) => Math.round(el.getBoundingClientRect().height));
    await start(page, card(5));
    await expect(machine(page)).toHaveAttribute('data-show', 'rest', { timeout: 5_000 });
    const inView = (id: string) =>
      page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= window.innerHeight + 1;
      });
    await expect.poll(() => inView('hl-card'), { message: `${where}: the card` }).toBe(true);
    for (const id of ['hl-high', 'hl-low', 'hl-take']) expect(await inView(id), `${where}: ${id}`).toBe(true);
    // Through a guess and its card turning, nothing moves, and the buttons keep their place and height.
    const seen = new Set<string>([JSON.stringify(before)]);
    await rigPresses(page, [drawing(card(9))]);
    await page.getByTestId('hl-high').click();
    while ((await machine(page).getAttribute('data-show')) !== 'rest') {
      seen.add(JSON.stringify(await boxes()));
      expect(await sideways(), where).toBeLessThanOrEqual(width);
      await page.waitForTimeout(80);
    }
    seen.add(JSON.stringify(await boxes()));
    expect([...seen], where).toEqual([JSON.stringify(before)]);
    expect(await page.locator('[data-mode]').evaluate((el) => Math.round(el.getBoundingClientRect().height)), where).toBe(controls);
    await page.getByTestId('hl-take').click();
    await expect(machine(page)).toHaveAttribute('data-state', 'taken');
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    // The Odds tab fits too.
    await page.locator('#hl-tab-odds').click();
    await expect(page.getByTestId('hl-rtp')).toHaveText(language === 'en' ? '89.96%' : '89.96%');
    expect(await sideways(), where).toBeLessThanOrEqual(width);
    await context.close();
  }
});

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a card is simply there: no turn, no slide, and the game goes on at once', async ({ page }) => {
    await openLadder(page);
    await start(page, card(3));
    await expect(machine(page)).toHaveAttribute('data-show', 'rest', { timeout: 1_000 });
    const animation = await page.locator('[data-testid="hl-next"] > span').nth(1).evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
    const started = Date.now();
    await rigPresses(page, [drawing(card(8))]);
    await page.getByTestId('hl-high').click();
    await expect(page.getByTestId('hl-ladder')).toHaveAttribute('data-lit', '1', { timeout: 1_000 });
    await expect(machine(page)).toHaveAttribute('data-show', 'rest');
    expect(Date.now() - started).toBeLessThan(1_500);
    await expect(page.getByTestId('hl-take')).toBeEnabled();
  });
});
