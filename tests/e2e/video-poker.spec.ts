import { test, expect, type Page } from '@playwright/test';

import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { WELCOME, createLedger, serializeLedger, take } from '../../src/components/game/MedalCenter/ledger';
import { analyzeHand } from '../../src/components/game/VideoPoker/analysis';
import { HANDS, PAY_TABLES, payout, rankCards } from '../../src/components/game/VideoPoker/engine';
import { HAND_KEY, NOTICE_KEY } from '../../src/components/game/VideoPoker/medals';
import { bankBalance, openCenter, resetAtCenter } from './medalCenterPage';
import { arrived } from './streamedPage';

// Hands are random: the tests read the cards off the screen, recompute the
// exact best play and the payout with the engine, and compare. Where a test
// needs a known hand (a win, say), it deals one: the deal's random numbers are
// set just before DEAL is pressed (`rig`).
//
// The machine plays with the medal center's medals: a fresh browser has a new
// member's 100, kept on the device, which the medal center shows too.

async function openVideoPoker(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/video-poker');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(page.getByTestId('vp-message')).toBeVisible();
  // The medals have been found.
  await expect(page.getByTestId('vp-medals')).toHaveAttribute('data-loaded', 'true');
}

/** The medals on the machine's counter. */
const medals = async (page: Page) => Number((await page.getByTestId('vp-medals').textContent())?.replace(/,/g, ''));
/** Waits until the machine holds the medals, so that it can be played. */
const playable = (page: Page) => expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 15_000 });

const RANKS = '23456789TJQKA';
/** "K♠" → the card's number. */
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);
/** A full house dealt, and the five cards a draw would bring: held whole, it wins 9 medals a medal bet. */
const FULL_HOUSE = ['K♠', 'K♥', '7♦', '7♣', '7♠', '2♠', '3♥', '4♦', '5♣', '9♠'];

/** Sets the next deal: the random numbers the deal (engine.ts) turns into exactly these ten cards, five dealt and five to come. */
async function rig(page: Page, cards: string[]) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const queue: number[] = [];
  cards.map(c).forEach((card, i) => {
    const j = deck.indexOf(card);
    queue.push((j - i + 0.5) / (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  });
  await page.evaluate((numbers) => {
    const original = Math.random;
    const left = [...numbers];
    Math.random = () => (left.length > 0 ? left.shift()! : original());
  }, queue);
}

/** Deals the rigged full house at five medals. */
async function dealFullHouse(page: Page) {
  await playable(page);
  await rig(page, FULL_HOUSE);
  await dealButton(page).click();
  await expect(drawButton(page)).toBeVisible();
  expect(await cardsOnScreen(page)).toEqual(FULL_HOUSE.slice(0, 5).map(c));
}

async function holdAll(page: Page) {
  for (let i = 0; i < 5; i++) {
    const slot = page.locator(`[data-slot="${i}"]`);
    if ((await slot.getAttribute('aria-pressed')) !== 'true') await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
  }
}
const dealButton = (page: Page) => page.getByRole('button', { name: 'DEAL', exact: true });
const drawButton = (page: Page) => page.getByRole('button', { name: 'DRAW', exact: true });
const cardsOnScreen = (page: Page) =>
  page.locator('[data-slot] [data-card]').evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-card'))));

/** Deals a hand (retrying until hydration has attached handlers) and returns its cards. */
async function dealHand(page: Page) {
  await playable(page);
  await expect(async () => {
    await dealButton(page).click({ timeout: 1_000 });
    await expect(drawButton(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('[data-slot] [data-card]')).toHaveCount(5);
  return cardsOnScreen(page);
}

async function holdMaskOnScreen(page: Page, mask: number) {
  for (let i = 0; i < 5; i++) {
    const slot = page.locator(`[data-slot="${i}"]`);
    const pressed = (await slot.getAttribute('aria-pressed')) === 'true';
    if (pressed !== ((mask & (1 << i)) !== 0)) await slot.click();
  }
}

test('the best play on screen is the exact optimum, and the draw pays by the table', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  let expected = WELCOME;
  expect(await medals(page)).toBe(expected);
  for (let round = 0; round < 6; round++) {
    const hand = await dealHand(page);
    expected -= 5;
    expect(await medals(page)).toBe(expected);

    const all = analyzeHand(hand, PAY_TABLES['9/6']);
    const best = all[0];
    await expect(page.getByTestId('vp-best')).toBeVisible({ timeout: 20_000 });
    // The top row is the best hold with its exact value.
    const top = page.getByTestId('vp-best').locator('li').first();
    await expect(top).toContainText(`${best.ev.toFixed(3)} × bet`);
    const topMask = Number(await top.getAttribute('data-mask'));
    expect(all.find((h) => h.mask === topMask)!.ev).toBeCloseTo(best.ev, 9);

    await page.getByRole('button', { name: 'Hold the best' }).click();
    for (let i = 0; i < 5; i++) {
      await expect(page.locator(`[data-slot="${i}"]`)).toHaveAttribute('aria-pressed', String((topMask & (1 << i)) !== 0));
    }
    await drawButton(page).click();
    await expect(dealButton(page)).toBeVisible();

    const final = await cardsOnScreen(page);
    // Held cards stay where they were; the others were replaced by new cards.
    for (let i = 0; i < 5; i++) {
      if (topMask & (1 << i)) expect(final[i]).toBe(hand[i]);
      else expect(hand).not.toContain(final[i]);
    }
    const rank = rankCards(final);
    const paid = payout(rank, PAY_TABLES['9/6'], 5);
    expected += paid;
    await expect.poll(() => medals(page)).toBe(expected);
    expect(await bankBalance(page)).toBe(expected);
    await expect(page.getByTestId('vp-win')).toHaveText(paid.toLocaleString('en-US'));
    if (rank > 0) await expect(page.getByTestId('vp-paytable').locator(`[data-hand="${HANDS[rank]}"]`)).toHaveAttribute('data-lit', 'true');
    await expect(page.getByTestId('vp-verdict')).toHaveText('That is the best play.');
  }
  await expect(page.getByTestId('vp-stats')).toContainText('6 / 6');
  await expect(page.getByTestId('vp-given-up')).toHaveText('0.00');
});

test('a worse hold is priced exactly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  const hand = await dealHand(page);
  await expect(page.getByTestId('vp-best')).toBeVisible({ timeout: 20_000 });
  const all = analyzeHand(hand, PAY_TABLES['9/6']);
  const worst = all[all.length - 1];
  await holdMaskOnScreen(page, worst.mask);
  await drawButton(page).click();
  const cost = all[0].ev - worst.ev;
  await expect(page.getByTestId('vp-verdict')).toHaveText(`That hold gives up ${cost.toFixed(3)} × your bet on average.`);
  await expect(page.getByTestId('vp-given-up')).toHaveText((cost * 5).toFixed(2));
  await expect(page.getByTestId('vp-stats')).toContainText('0 / 1');
});

test('a finished hand keeps the bet and pay table it was dealt under', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  const hand = await dealHand(page);
  await expect(page.getByTestId('vp-best')).toBeVisible({ timeout: 20_000 });
  const all = analyzeHand(hand, PAY_TABLES['9/6']);
  const worst = all[all.length - 1];
  await holdMaskOnScreen(page, worst.mask);
  await drawButton(page).click();
  const verdict = `That hold gives up ${(all[0].ev - worst.ev).toFixed(3)} × your bet on average.`;
  await expect(page.getByTestId('vp-verdict')).toHaveText(verdict);
  const top = page.getByTestId('vp-best').locator('li').first();
  await expect(top).toContainText(`${all[0].ev.toFixed(3)} × bet`);

  // Settings for the next hand: one coin (the royal drops to 250) on the 6/5 table.
  await page.getByRole('button', { name: 'Bet one' }).click();
  await expect(page.getByTestId('vp-bet')).toHaveText('1');
  await page.locator('#vp-paytable-select').selectOption('6/5');
  const table = page.getByTestId('vp-paytable');
  await expect(table.locator('[data-hand="fullHouse"] td').first()).toHaveText('6');
  await expect(table.getByRole('columnheader', { name: '1 medal (current bet)' })).toHaveCount(1);
  await expect(table.getByRole('columnheader', { name: '5 medals', exact: true })).toHaveCount(1);

  // The finished hand is still judged by the rules it was played under.
  await expect(top).toContainText(`${all[0].ev.toFixed(3)} × bet`);
  await expect(page.getByTestId('vp-verdict')).toHaveText(verdict);
});

test('a hand drawn before the analysis is ready is still judged', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  // Draw at once, holding nothing, without waiting for the Best play panel.
  const hand = await dealHand(page);
  await drawButton(page).click();
  await expect(dealButton(page)).toBeVisible();
  const all = analyzeHand(hand, PAY_TABLES['9/6']);
  const cost = all[0].ev - all.find((h) => h.mask === 0)!.ev;
  await expect(page.getByTestId('vp-stats')).toContainText(`${cost < 1e-9 ? 1 : 0} / 1`, { timeout: 20_000 });
  await expect(page.getByTestId('vp-given-up')).toHaveText((cost * 5).toFixed(2));
});

test('the bet changes the pay column and what is taken', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  await playable(page);
  await expect(async () => {
    await page.getByRole('button', { name: 'Bet one' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('vp-bet')).toHaveText('1', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Bet one' }).click();
  await expect(page.getByTestId('vp-bet')).toHaveText('2');
  await dealButton(page).click();
  await expect(drawButton(page)).toBeVisible();
  expect(await medals(page)).toBe(WELCOME - 2);
  await expect(page.getByTestId('vp-message')).toHaveText('BET 2 medals. Tap the cards to hold, then DRAW.');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2);
  // The bet is locked while a hand is in play.
  await expect(page.getByRole('button', { name: 'Bet one' })).toBeDisabled();
  await expect(page.locator('#vp-paytable-select')).toBeDisabled();
});

test('switching tabs mid-hand keeps the hand', async ({ page }) => {
  await openVideoPoker(page);
  const hand = await dealHand(page);
  await page.getByRole('tab', { name: 'Odds' }).click();
  await expect(page.getByTestId('vp-payback')).toHaveText('99.5439%');
  await page.getByRole('tab', { name: 'Machine' }).click();
  expect(await cardsOnScreen(page)).toEqual(hand);
  await expect(drawButton(page)).toBeVisible();
});

test('on a phone the pay table shows the bet’s column in type that can be read, and the cards take the width they have', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 900 });
    await openVideoPoker(page);
    // The hand dealt at the first width is kept through the reloads, and is there at the others.
    if (width === 320) await dealHand(page);
    await expect(drawButton(page)).toBeVisible();
    await expect(page.locator('[data-slot] [data-card]')).toHaveCount(5);
    const look = await page.evaluate(() => {
      const table = document.querySelector('[data-testid="vp-paytable"]')!;
      const shown = (el: Element) => getComputedStyle(el).display !== 'none';
      const cells = [...table.querySelectorAll('tbody tr:first-child td')].filter(shown);
      const cards = [...document.querySelectorAll('[data-slot] [data-card]')].map((c) => c.getBoundingClientRect());
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      return {
        columns: cells.length,
        text: cells.map((c) => c.textContent),
        font: parseFloat(getComputedStyle(cells[0]).fontSize),
        cardWidth: Math.min(...cards.map((c) => c.width)),
        overlap: cards.some((c, i) => i > 0 && c.left < cards[i - 1].right - 0.5),
        sideways: document.documentElement.scrollWidth,
        draw: box('button[class*="dealBtn"]'),
        betOne: box('button[class*="machineBtn"]:not([class*="dealBtn"])'),
      };
    });
    // One column, the bet's (five medals: the royal is 4,000), in type of at least 12 px.
    expect(look.columns).toBe(1);
    expect(look.text).toEqual(['4,000']);
    expect(look.font).toBeGreaterThanOrEqual(12);
    // Five cards side by side, none over another, as large as the row allows (58 px or more from 375 px up).
    expect(look.overlap).toBe(false);
    if (width >= 375) expect(look.cardWidth).toBeGreaterThanOrEqual(56);
    // DRAW under Bet one and Bet max, the width of both.
    expect(look.draw.top).toBeGreaterThan(look.betOne.bottom - 1);
    expect(look.draw.width).toBeGreaterThan(look.betOne.width * 1.8);
    expect(look.sideways).toBeLessThanOrEqual(width);
  }
  // A desktop still shows all five columns.
  await page.setViewportSize({ width: 1280, height: 900 });
  await openVideoPoker(page);
  const columns = await page.evaluate(
    () => [...document.querySelectorAll('[data-testid="vp-paytable"] tbody tr:first-child td')].filter((c) => getComputedStyle(c).display !== 'none').length,
  );
  expect(columns).toBe(5);
});

test('the odds tab prices every pay table and shows the close calls', async ({ page }) => {
  await openVideoPoker(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('vp-payback')).toHaveText('99.5439%');
  await expect(async () => {
    await page.getByRole('radio', { name: '8/5' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('vp-payback')).toHaveText('97.2984%', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId('vp-calls').locator('li')).toHaveCount(5, { timeout: 20_000 });
  // Breaking a made flush (5 per coin on this table) for four to a royal.
  await expect(page.locator('[data-call="breakFlush"]')).toContainText('18.277');
  await expect(page.locator('[data-call="breakFlush"]')).toContainText('5.000');
});

test('the simulation tab compares strategies and plays sessions', async ({ page }) => {
  await openVideoPoker(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const section = (title: string) => page.locator('section', { has: page.getByRole('heading', { name: title }) });

  const strategies = section('Perfect play against two habits, on the same deals');
  await strategies.getByRole('combobox').selectOption('10000');
  await expect(async () => {
    await strategies.getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('vp-sim-strategies')).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId('vp-sim-strategies').locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tr[data-strategy="optimal"] td').nth(1)).toHaveText('99.544%');
  await expect(page.locator('tr[data-strategy="simple"] td').nth(1)).toHaveText('97.127%');
  // Perfect play never differs from itself.
  await expect(page.locator('tr[data-strategy="optimal"] td').nth(3)).toHaveText('0.0%');

  const sessions = section('One evening at the machine');
  await sessions.getByRole('combobox').nth(0).selectOption('500');
  await sessions.getByRole('combobox').nth(1).selectOption('200');
  await sessions.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('vp-sim-sessions')).toBeVisible({ timeout: 30_000 });
  // 200 hands at 5 coins on a 99.5439% game: −4.6 coins expected; a royal in 0.49% of sessions.
  await expect(page.getByTestId('vp-session-expected')).toHaveText('−4.6');
  await expect(page.getByTestId('vp-session-royal-exact')).toHaveText('exact: 0.49%');

  // The histogram is also there as a table: every session is in exactly one row.
  const histogram = page.getByTestId('vp-histogram-table');
  await expect(histogram.locator('caption')).toHaveText('Sessions by net medals at the end. The exact expectation is −4.6 medals.');
  const counts = await histogram.locator('tbody td').allTextContents();
  expect(counts.reduce((sum, c) => sum + Number(c.replace(/,/g, '')), 0)).toBe(500);
  await expect(histogram.locator('tbody th').first()).toHaveText(/^−[\d,]+ to [−+]?[\d,]+$/);

  // Dark label on the green Run buttons.
  await expect(sessions.getByRole('button', { name: 'Run' })).toHaveCSS('color', 'rgb(4, 20, 10)');
  // The simulation plays with medals of its own: the player's are as they were.
  expect(await bankBalance(page)).toBe(WELCOME);
});

// ── The medals ──────────────────────────────────────────────────────────────

test('a bet comes out of your medals and a win goes back in, and the medal center shows the same count after a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  expect(await medals(page)).toBe(WELCOME);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME);

  // BET 5 medals: they come out as the cards are dealt.
  await dealFullHouse(page);
  await expect(page.getByTestId('vp-message')).toHaveText('BET 5 medals. Tap the cards to hold, then DRAW.');
  expect(await medals(page)).toBe(WELCOME - 5);
  expect(await bankBalance(page)).toBe(WELCOME - 5);

  // A full house at five medals wins 45, and they go back in.
  await holdAll(page);
  await drawButton(page).click();
  await expect(page.getByTestId('vp-message')).toHaveText('Full House! Won 45 medals');
  await expect(page.getByTestId('vp-win')).toHaveText('45');
  expect(await medals(page)).toBe(WELCOME - 5 + 45);
  expect(await bankBalance(page)).toBe(WELCOME - 5 + 45);
  await expect(page.getByTestId('vp-net')).toHaveText('+40');

  // After a reload the machine shows the same medals and the finished hand, and nothing is won twice.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('vp-medals')).toHaveText('140');
  await expect(dealButton(page)).toBeVisible();
  await expect.poll(() => cardsOnScreen(page)).toEqual(FULL_HOUSE.slice(0, 5).map(c));
  expect(await bankBalance(page)).toBe(WELCOME - 5 + 45);

  // The medal center shows the same count, and has the machine open on its floor.
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText('140');
  await expect(page.getByTestId('center-play-video-poker')).toHaveAttribute('href', '/games/video-poker');
  await page.getByTestId('center-play-video-poker').click();
  await expect(page).toHaveURL(/\/games\/video-poker$/);
  await arrived(page);
  await expect(page.getByTestId('vp-medals')).toHaveText('140');
});

test('a win runs into the medals on the counter while the WIN meter shows it whole, and DEAL ends the count', async ({ page }) => {
  await openVideoPoker(page);
  await dealFullHouse(page);
  await holdAll(page);
  await drawButton(page).click();
  await expect(page.getByTestId('vp-win')).toHaveText('45');
  // The medals are the player's at once (in type for a screen reader); the counter's LEDs run up to them.
  expect(await medals(page)).toBe(WELCOME - 5 + 45);
  const led = () => page.getByTestId('vp-medals-led').evaluate((el) => Number((el as HTMLElement).dataset.shown));
  const early = await led();
  expect(early).toBeGreaterThanOrEqual(WELCOME - 5);
  expect(early).toBeLessThan(WELCOME - 5 + 45);
  await expect.poll(led, { timeout: 4_000 }).toBe(WELCOME - 5 + 45);

  // Another full house; DEAL pressed while it runs in shows the medals less the next bet at once.
  await dealFullHouse(page);
  await holdAll(page);
  await drawButton(page).click();
  expect(await led()).toBeLessThan(WELCOME - 10 + 90);
  await dealButton(page).click();
  await expect.poll(led, { timeout: 1_000 }).toBe(WELCOME - 15 + 90);
  expect(await medals(page)).toBe(WELCOME - 15 + 90);
});

test('a hand dealt before a reload is there after it: the same cards, no second bet, and its win once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  await dealFullHouse(page);
  // Two kings held, then the page is reloaded before the draw.
  await page.locator('[data-slot="0"]').click();
  await page.locator('[data-slot="1"]').click();
  await expect(page.locator('[data-slot="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => JSON.parse((await page.evaluate((key) => window.localStorage.getItem(key), HAND_KEY)) ?? '{}').held).toBe(0b00011);
  await page.reload();
  await arrived(page);
  await playable(page);
  // The hand is still dealt, held as it was left, and the bet was not taken again (nor handed back).
  await expect(drawButton(page)).toBeVisible();
  expect(await cardsOnScreen(page)).toEqual(FULL_HOUSE.slice(0, 5).map(c));
  await expect(page.locator('[data-slot="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-slot="2"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await medals(page)).toBe(WELCOME - 5);
  expect(await bankBalance(page)).toBe(WELCOME - 5);
  await holdAll(page);
  await drawButton(page).click();
  await expect(page.getByTestId('vp-message')).toHaveText('Full House! Won 45 medals');
  expect(await bankBalance(page)).toBe(WELCOME + 40);
  // Reloaded again: the hand is finished, and its win is in once.
  await page.reload();
  await arrived(page);
  await playable(page);
  await expect(dealButton(page)).toBeVisible();
  await expect(page.getByTestId('vp-medals')).toHaveText('140');
  expect(await bankBalance(page)).toBe(WELCOME + 40);
});

test('another tab takes the medals: this machine waits and takes no bet, and Play here brings them back', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  await dealFullHouse(page);
  const other = await context.newPage();
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(other);
  await playable(other);
  // The first tab waits, says why, and can neither draw nor deal.
  await expect(page.getByTestId('vp-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('vp-play-here')).toHaveText('Play here');
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'false');
  await expect(drawButton(page)).toBeDisabled();
  // The second tab has the same hand, from the same medals, and plays it.
  await expect.poll(() => cardsOnScreen(other)).toEqual(FULL_HOUSE.slice(0, 5).map(c));
  expect(await medals(other)).toBe(WELCOME - 5);
  await holdAll(other);
  await drawButton(other).click();
  await expect(other.getByTestId('vp-message')).toHaveText('Full House! Won 45 medals');
  expect(await bankBalance(other)).toBe(WELCOME + 40);
  // Back to the first: it has the medals again, shows the hand as the other tab finished it, and the other waits.
  await page.bringToFront();
  await page.getByTestId('vp-play-here').click();
  await expect(page.getByTestId('vp-card-away')).toHaveCount(0);
  await playable(page);
  await expect(dealButton(page)).toBeVisible();
  await expect(page.getByTestId('vp-medals')).toHaveText('140');
  await expect(other.getByTestId('vp-card-away')).toBeVisible({ timeout: 10_000 });
  expect(await bankBalance(page)).toBe(WELCOME + 40);
});

test('the medal center’s reset starts the machine over: the hand on it goes with the medals it was bet from', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  await dealFullHouse(page);
  expect(await bankBalance(page)).toBe(WELCOME - 5);
  await resetAtCenter(page);
  expect(await bankBalance(page)).toBe(WELCOME);
  await openVideoPoker(page);
  await playable(page);
  // No hand: face-down cards and DEAL, and the new medals, with nothing of the old hand's win in them.
  await expect(page.getByTestId('vp-message')).toHaveText('Press DEAL to start.');
  await expect(dealButton(page)).toBeVisible();
  await expect(page.locator('[data-slot] [data-card]')).toHaveCount(0);
  await expect(page.getByTestId('vp-medals')).toHaveText(String(WELCOME));
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), HAND_KEY)).toBeNull();
  // And it plays on from the new medals.
  await dealFullHouse(page);
  expect(await bankBalance(page)).toBe(WELCOME - 5);
});

test('a reset at the medal center in another tab reaches the machine where it stands', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  await dealFullHouse(page);
  const hub = await context.newPage();
  await resetAtCenter(hub);
  // The machine hears of it: the hand on it is gone, and it says why.
  await expect(page.getByTestId('vp-message')).toHaveText('Press DEAL to start.');
  await expect(drawButton(page)).toHaveCount(0);
  await expect(page.getByTestId('vp-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('vp-announcement')).toHaveText(
    'Your medals were reset at the Medal Game Center: this machine starts over, and the hand that was on it is gone.',
  );
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), HAND_KEY)).toBeNull();
  expect(await bankBalance(page)).toBe(WELCOME);
  await dealFullHouse(page);
  expect(await bankBalance(page)).toBe(WELCOME - 5);
});

test('a player with no medals left is offered the free refill', async ({ page }) => {
  // A guest whose medals have all been played.
  const empty = take(createLedger('testdevice01'), WELCOME)!;
  await page.addInitScript(
    ([key, text]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text);
    },
    [BANK_KEY, serializeLedger(empty)],
  );
  await openVideoPoker(page);
  await playable(page);
  await expect(page.getByTestId('vp-medals')).toHaveText('0');
  await dealButton(page).click();
  await expect(page.getByTestId('vp-message')).toHaveText('Not enough medals for that bet.');
  await page.getByTestId('vp-refill').click();
  await expect(page.getByTestId('vp-medals')).toHaveText('100');
  await expect(page.getByTestId('vp-refill')).toHaveCount(0);
  await expect(page.getByTestId('vp-announcement')).toHaveText('100 medals added.');
});

test('says once that it plays with the medals now, says what medals are, and fits a phone in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openVideoPoker(page);
  const notice = page.getByTestId('vp-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('This machine now plays with your medals from the Medal Game Center');
  await expect(page.getByTestId('vp-notice-center')).toHaveAttribute('href', '/games/medal-center');
  await expect(page.getByTestId('vp-center')).toHaveAttribute('href', '/games/medal-center');
  await expect(page.getByTestId('vp-not-money')).toHaveText(
    'Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByTestId('vp-notice-dismiss').click();
  await expect(notice).toHaveCount(0);
  // Once: not again.
  await openVideoPoker(page, 'ja');
  await expect(page.getByTestId('vp-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('vp-notice')).toHaveCount(0);
  await expect(page.getByTestId('vp-not-money')).toHaveText('メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。');
  await expect(page.getByTestId('vp-center')).toContainText('メダルゲームセンター');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await playable(page);
  await page.getByRole('button', { name: 'ディール', exact: true }).click();
  await expect(page.getByTestId('vp-message')).toHaveText('5枚ベット。残すカードをタップして「ドロー」。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});

test('anything else lying where the hand is kept is taken for no hand: the machine opens, and plays', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ([hand, notice]) => {
      window.localStorage.setItem(hand, '{"v":1,"credits":1000,"hand":[1,2,3]}');
      window.localStorage.setItem(notice, 'yes');
    },
    [HAND_KEY, NOTICE_KEY],
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  await playable(page);
  await expect(page.getByTestId('vp-message')).toHaveText('Press DEAL to start.');
  await expect(page.getByTestId('vp-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('vp-notice')).toHaveCount(0);
  await dealHand(page);
  expect(await bankBalance(page)).toBe(WELCOME - 5);
  expect(errors).toEqual([]);
});
