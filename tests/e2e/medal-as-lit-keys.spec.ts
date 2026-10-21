import { test, expect, type BrowserContext, type Locator, type Page } from './fixtures';

import { POCKETS, randomsFor } from '../../src/components/game/BallBingo/engine';
import { ROUND_KEY as BINGO_ROUND_KEY, parseRound as parseBingoRound } from '../../src/components/game/BallBingo/medals';
import { CHEST_CELLS } from '../../src/components/game/Fishing/engine';
import { ROUND_KEY as FISHING_ROUND_KEY, parseRound as parseFishingRound } from '../../src/components/game/Fishing/medals';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// A machine's key pressed the moment the button it stands for is drawn enabled does what that button does.
//
// The keys reach a machine through a listener on the window, which asks a copy of the machine's handler (a ref, in
// MedalCenter/machineKeys.ts; Janken binds its own listener again). An effect after the paint brought that copy up to
// date, so a key pressed as a button lit went to the handler of the render before, which still saw the button off and
// did nothing. That gap opened when the button lit on a render the bank had nothing to do with: a ball landing in the
// middle of a game, the cards dealt out, a roll that won nothing, the roulette's lamp coming to rest. Each test presses
// the key at such a moment, from a MutationObserver the instant the button's `disabled` goes away, before the page has
// run anything after drawing it. The floor's API answers at once (fixtures.ts); nothing reaches a real server.

test.beforeEach(async ({ context }) => {
  // One button after another on a page taller than the window: the page scrolls at once, so no press lands elsewhere.
  await instantScroll(context);
});

const TARGET = 'data-as-lit-target';

/** Marks the one button a test watches, for a button with no test id of its own. */
const markTarget = (button: Locator) => button.evaluate((el, name) => el.setAttribute(name, ''), TARGET);

/**
 * Arms a press of `key` (keydown and keyup, from the page's body) for the instant the button `selector` names is next
 * drawn enabled after being off. The button is looked for whenever the page changes: one not on the page (a machine
 * may put another button in its place while a round is on) or disabled is off. `keyedAsLit` waits for the key.
 */
async function keyAsItLights(page: Page, selector: string, key: string): Promise<void> {
  await page.evaluate(
    ({ selector, key }) => {
      const w = window as unknown as { __asLit?: Promise<void> };
      w.__asLit = new Promise<void>((resolve, reject) => {
        let off = document.querySelector<HTMLButtonElement>(selector)?.disabled ?? true;
        const timer = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error(`${selector} never lit again`));
        }, 60_000);
        const observer = new MutationObserver(() => {
          const button = document.querySelector<HTMLButtonElement>(selector);
          if (!button || button.disabled) {
            off = true;
            return;
          }
          if (!off) return;
          observer.disconnect();
          window.clearTimeout(timer);
          for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
          resolve();
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
      });
      // Waited for later (`keyedAsLit`): a button that never lights again fails the test there, not the page.
      w.__asLit.catch(() => undefined);
    },
    { selector, key },
  );
}

const keyedAsLit = (page: Page): Promise<void> => page.evaluate(() => (window as unknown as { __asLit: Promise<void> }).__asLit);

/** Opens a machine's page in English. */
async function openMachine(page: Page, baseURL: string | undefined, path: string): Promise<void> {
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: baseURL ?? 'http://localhost:3000' }]);
  expect((await page.goto(path))?.status()).toBe(200);
  await arrived(page);
}

/**
 * The medal center, open in another tab with the day's bonus there to take, and the machine's page brought back in
 * front of it. Opened before the round, so that the bonus can be taken while the round's show is still on.
 */
async function hubBehind(context: BrowserContext, page: Page): Promise<Page> {
  const hub = await context.newPage();
  await openCenter(hub);
  await expect(hub.getByTestId('pusher-bonus-take')).toBeVisible();
  await page.bringToFront();
  return hub;
}

/**
 * The day's bonus taken at the medal center while the round's show is on: it borrows the medals for a moment, and the
 * round is settled as they go (`settled` says when it has). Then the tab is closed, and the medals come back.
 */
async function bonusWhileOn(hub: Page, settled: () => Promise<boolean>): Promise<void> {
  await hub.getByTestId('pusher-bonus-take').click();
  await expect(hub.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  await expect.poll(settled).toBe(true);
  await hub.close();
}

test('Ball Bingo: Space pressed as LAUNCH lights again, the first ball in its pocket, shoots the next ball', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMachine(page, baseURL, '/games/ball-bingo');
  const cabinet = page.getByTestId('bingo-cabinet');
  await expect(cabinet).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  const round = async () => parseBingoRound(await page.evaluate((key) => window.localStorage.getItem(key), BINGO_ROUND_KEY));
  // Five balls, every one OUT. START shoots the first; LAUNCH lights again once it has dropped.
  const out = POCKETS.findIndex((p) => p.id === 'out-l');
  await rigPresses(page, randomsFor([out, out, out, out, out]));
  await keyAsItLights(page, '[data-testid="bingo-launch"]', ' ');
  await pressUntil(page.getByTestId('bingo-start'), async () => !['idle', 'over'].includes((await cabinet.getAttribute('data-phase')) ?? 'idle'));
  await keyedAsLit(page);
  await expect.poll(async () => (await round())?.shown, { timeout: 10_000 }).toBe(2);
});

test('Fishing: Space pressed as CAST comes back, on a cast the medal center settled while the line was out, casts again', async ({ page, context, baseURL }) => {
  test.setTimeout(60_000);
  const hub = await hubBehind(context, page);
  await openMachine(page, baseURL, '/games/fishing');
  const cabinet = page.getByTestId('fishing-cabinet');
  await expect(cabinet).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  const round = async () => parseFishingRound(await page.evaluate((key) => window.localStorage.getItem(key), FISHING_ROUND_KEY));
  // Two casts on a bet of 1, nothing biting either: the second is the one cast with Space as CAST comes back.
  const nothing = [0.9999, 0.999, 0.5 / CHEST_CELLS];
  await rigPresses(page, [...nothing, ...nothing]);
  await keyAsItLights(page, '[data-testid="fishing-cast"]', ' ');
  await pressUntil(page.getByTestId('fishing-cast'), async () => (await cabinet.getAttribute('data-casting')) === 'true');
  const first = (await round())?.id;
  await bonusWhileOn(hub, async () => (await round())?.paid === true);
  await expect(cabinet).toHaveAttribute('data-casting', 'true');
  await keyedAsLit(page);
  await expect(cabinet).toHaveAttribute('data-casting', 'true');
  expect((await round())?.id).not.toBe(first);
});

/** The random numbers a Video Poker deal turns into exactly these ten cards (five dealt, five to come). */
function dealOf(cards: number[]): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  return cards.map((card, i) => {
    const j = deck.indexOf(card);
    [deck[i], deck[j]] = [deck[j], deck[i]];
    return (j - i + 0.5) / (52 - i);
  });
}

test('Video Poker: 1 pressed as the dealt cards light holds the first card', async ({ page, baseURL }) => {
  await openMachine(page, baseURL, '/games/video-poker');
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  const first = page.locator('[data-slot="0"]');
  // The cards turn over one by one, and only once they all have can a card be held.
  await rigPresses(page, dealOf([0, 14, 28, 42, 5, 6, 7, 8, 9, 10]));
  await keyAsItLights(page, '[data-slot="0"]', '1');
  const deal = page.getByRole('button', { name: 'DEAL', exact: true });
  await expect(async () => {
    await deal.click({ timeout: 1_000 });
    await expect(page.getByRole('button', { name: 'DRAW', exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await keyedAsLit(page);
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-slot="1"]')).toHaveAttribute('aria-pressed', 'false');
});

test('Janken: 1 pressed as the hands light again after a draw throws rock again', async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  await openMachine(page, baseURL, '/games/janken');
  const cabinet = page.getByTestId('janken-cabinet');
  await expect(cabinet).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  const medals = async () => Number(((await page.getByTestId('janken-medals').textContent()) ?? '').replace(/,/g, ''));
  await pressUntil(page.getByTestId('janken-medal-in'), async () => (await medals()) < WELCOME);
  await expect(cabinet).toHaveAttribute('data-phase', 'calling');
  // Rock against the cat's rock, a draw: once the hands have been shown, they light again for the throw again. The
  // throw made with 1 as they light is rock against the cat's paper, lost.
  await rigPresses(page, [0.1, 0.9]);
  await keyAsItLights(page, '[data-testid="janken-hand-gu"]', '1');
  await page.getByTestId('janken-hand-gu').click();
  await keyedAsLit(page);
  await expect(page.getByTestId('janken-lamp-lose')).toHaveAttribute('data-on', 'true', { timeout: 10_000 });
  await expect(cabinet).toHaveAttribute('data-phase', 'idle');
  expect(await bankBalance(page)).toBe(WELCOME - 1);
});

test('Sic Bo: R pressed as the table lights again after a losing roll puts the last bets back', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMachine(page, baseURL, '/games/sic-bo');
  await expect(page.getByTestId('sb-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  const big = page.getByTestId('sb-area-big');
  await pressUntil(big, async () => Number(await big.getAttribute('data-amount')) > 0);
  // 1, 1 and 2: Small, and the medal on Big lost.
  await rigPresses(page, [0.5 / 6, 0.5 / 6, 1.5 / 6]);
  await keyAsItLights(page, '[data-testid="sb-rebet"]', 'r');
  await page.getByTestId('sb-shake').click();
  await keyedAsLit(page);
  await expect(big).toHaveAttribute('data-amount', '1');
  // A bet is out of the medals as it is put down: the medal lost, and the one put back on Big.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2);
});

test('Craps: Space pressed as ROLL lights again after a roll that settles nothing throws again', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMachine(page, baseURL, '/games/craps');
  await expect(page.getByTestId('craps-counter')).toHaveAttribute('data-loaded', 'true', { timeout: 20_000 });
  const felt = page.getByTestId('craps-table');
  const passLine = page.locator('#craps-panel-play').getByRole('button', { name: /^Pass Line \(1:1\)/ });
  await pressUntil(passLine, async () => (await page.getByTestId('craps-on-table').textContent()) !== '0');
  const roll = page.getByRole('button', { name: 'ROLL', exact: true });
  await markTarget(roll);
  // A 4 on the come-out: the point is set, and nothing is won or lost.
  await rigPresses(page, [1.5 / 6, 1.5 / 6]);
  const before = Number(await felt.getAttribute('data-settled'));
  await keyAsItLights(page, `[${TARGET}]`, ' ');
  await roll.click();
  await keyedAsLit(page);
  await expect.poll(async () => Number(await felt.getAttribute('data-settled')), { timeout: 10_000 }).toBe(before + 2);
});
