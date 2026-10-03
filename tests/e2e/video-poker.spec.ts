import { test, expect, type Page } from '@playwright/test';

import { analyzeHand } from '../../src/components/game/VideoPoker/analysis';
import { HANDS, PAY_TABLES, payout, rankCards } from '../../src/components/game/VideoPoker/engine';

// Hands are random: the tests read the cards off the screen, recompute the
// exact best play and the payout with the engine, and compare.

async function openVideoPoker(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/video-poker');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('vp-message')).toBeVisible();
}

const credits = async (page: Page) => Number((await page.getByTestId('vp-credits').textContent())?.replace(/,/g, ''));
const dealButton = (page: Page) => page.getByRole('button', { name: 'DEAL', exact: true });
const drawButton = (page: Page) => page.getByRole('button', { name: 'DRAW', exact: true });
const cardsOnScreen = (page: Page) =>
  page.locator('[data-slot] [data-card]').evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-card'))));

/** Deals a hand (retrying until hydration has attached handlers) and returns its cards. */
async function dealHand(page: Page) {
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
  let expected = 1000;
  for (let round = 0; round < 6; round++) {
    const hand = await dealHand(page);
    expected -= 5;
    expect(await credits(page)).toBe(expected);

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
    expect(await credits(page)).toBe(expected);
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
  await expect(table.getByRole('columnheader', { name: '1 coin (current bet)' })).toHaveCount(1);
  await expect(table.getByRole('columnheader', { name: '5 coins', exact: true })).toHaveCount(1);

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
  await expect(async () => {
    await page.getByRole('button', { name: 'Bet one' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('vp-bet')).toHaveText('1', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Bet one' }).click();
  await expect(page.getByTestId('vp-bet')).toHaveText('2');
  await dealButton(page).click();
  await expect(drawButton(page)).toBeVisible();
  expect(await credits(page)).toBe(998);
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
});
