import { test, expect, type Page } from './fixtures';

import { handTotal, type Rank, type Suit } from '../../src/components/game/Baccarat/engine';
import { TABLE_KEY, medalsBack, parseTable } from '../../src/components/game/Baccarat/medals';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { cardsOf, dealButton, firstBet, openBaccarat, replay } from './baccaratPage';
import { bankBalance } from './medalCenterPage';
import { pressUntil } from './pressUntil';

// The squeeze (絞り): the hand's last card slides out face down and its face is peeled up before it is turned. It is
// short, a tap on the hand (or Space) turns it at once, a reduced-motion player never sees it, and it only shows a card
// that was drawn, with the medals it moves, at the deal.

const squeezed = (page: Page) => page.locator('[data-squeeze="peel"]');

test('the last card is squeezed face down, a tap turns it at once, and the hand and its medals were settled at the deal', async ({ page }) => {
  await openBaccarat(page);
  await firstBet(page, /^Player \(1:1\)/);
  await dealButton(page).click();
  await expect(squeezed(page)).toHaveCount(1, { timeout: 5_000 });
  await expect(page.getByTestId('baccarat-callout')).toHaveText('Squeezing… tap to turn it');
  // Every card of the hand is on the table, the squeezed one face down, and the table this browser keeps already has
  // that hand as its last: it was drawn, and written down, at the deal.
  const hand = replay(await cardsOf(page, 'player'), await cardsOf(page, 'banker'));
  const kept = parseTable(await page.evaluate((key) => window.localStorage.getItem(key), TABLE_KEY));
  expect(kept?.last?.hand.player).toEqual(hand.player);
  expect(kept?.last?.hand.banker).toEqual(hand.banker);
  // The squeezed card is not counted yet: its side's total is that of the side's other cards.
  const side = (await page.locator('[data-hand="player"] [data-squeeze]').count()) > 0 ? 'player' : 'banker';
  const others = await page
    .locator(`[data-hand="${side}"] [data-rank]:not([data-squeeze])`)
    .evaluateAll((els) => els.map((el) => ({ rank: el.getAttribute('data-rank') as Rank, suit: el.getAttribute('data-suit') as Suit })));
  await expect(page.getByTestId(`${side}-total`)).toHaveText(others.length > 0 ? String(handTotal(others)) : '–');

  const tapped = Date.now();
  await page.getByTestId('baccarat-squeeze').click();
  await expect(page.locator('[data-squeeze="done"]')).toHaveCount(1);
  await expect(page.getByTestId(`${side}-total`)).toHaveText(String(side === 'player' ? hand.playerTotal : hand.bankerTotal));
  await expect(dealButton(page)).toBeEnabled();
  // Turned at once: the result is called a beat after the tap, not when the squeeze would have ended.
  expect(Date.now() - tapped).toBeLessThan(1_000);
  await expect(page.getByTestId('baccarat-squeeze')).toHaveCount(0);
  // And the medals are what that hand gives.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + medalsBack({ player: 1 }, hand, 'ez').returned);
});

test('left alone, the squeeze ends by itself in a little over a second', async ({ page }) => {
  await openBaccarat(page);
  await firstBet(page, /^Player \(1:1\)/);
  await dealButton(page).click();
  await expect(squeezed(page)).toHaveCount(1, { timeout: 5_000 });
  const started = Date.now();
  await expect(page.locator('[data-squeeze="done"]')).toHaveCount(1, { timeout: 3_000 });
  expect(Date.now() - started).toBeGreaterThan(700);
  await expect(dealButton(page)).toBeEnabled();
});

test('on a desk Space turns the squeezed card, as a tap does', async ({ page }) => {
  await openBaccarat(page);
  await firstBet(page, /^Player \(1:1\)/);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect(squeezed(page)).toHaveCount(1, { timeout: 5_000 });
  await page.keyboard.press('Space');
  await expect(page.locator('[data-squeeze="done"]')).toHaveCount(1);
  await expect(dealButton(page)).toBeEnabled();
});

test('a reduced-motion player sees no squeeze: every card is turned at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await firstBet(page, /^Player \(1:1\)/);
  await dealButton(page).click();
  await expect(dealButton(page)).toBeEnabled({ timeout: 5_000 });
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1);
  await expect(page.locator('[data-squeeze]')).toHaveCount(0);
  await expect(page.getByTestId('baccarat-squeeze')).toHaveCount(0);
});

test('on the narrowest phone the squeeze says so on one line, and the table does not move', async ({ browser }) => {
  for (const language of ['en', 'ja'] as const) {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openBaccarat(page, language);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const player = page.locator('button[data-bet="player"]:visible').first();
    await pressUntil(player, async () => (await page.getByTestId('baccarat-on-table').getAttribute('data-medals')) !== '0');
    // The moment the last card is put down to be squeezed, the page notes the call-out's words and lines and where the
    // Player spot is (the squeeze is over in a little more than a second, too soon to look at it from outside).
    await page.evaluate(() => {
      const w = window as unknown as { __before: number; __atSqueeze?: { text: string; lines: number; spot: number } };
      const spot = () => document.querySelector('button[data-bet="player"]')!.getBoundingClientRect().top + window.scrollY;
      w.__before = spot();
      const watch = new MutationObserver(() => {
        if (!document.querySelector('[data-squeeze="peel"]') || w.__atSqueeze) return;
        const span = document.querySelector('[data-testid="baccarat-callout"] span')!;
        const range = document.createRange();
        range.selectNodeContents(span);
        const tops = [...range.getClientRects()].map((r) => r.top).sort((a, b) => a - b);
        w.__atSqueeze = { text: span.textContent ?? '', lines: tops.filter((top, i) => i === 0 || top - tops[i - 1] > 6).length, spot: spot() };
        watch.disconnect();
      });
      watch.observe(document.body, { subtree: true, childList: true, attributes: true });
    });
    await page.getByRole('button', { name: language === 'en' ? 'DEAL' : 'ディール', exact: true }).click();
    await expect(page.locator('[data-squeeze="done"]')).toHaveCount(1, { timeout: 8_000 });
    const { __before: before, __atSqueeze: atSqueeze } = await page.evaluate(() => {
      const w = window as unknown as { __before: number; __atSqueeze?: { text: string; lines: number; spot: number } };
      return { __before: w.__before, __atSqueeze: w.__atSqueeze };
    });
    expect(atSqueeze, language).toBeTruthy();
    expect(atSqueeze?.text, language).toBe(language === 'en' ? 'Squeezing… tap to turn it' : '絞り中… タップでめくる');
    expect(atSqueeze?.lines, language).toBe(1);
    expect(Math.abs((atSqueeze?.spot ?? 0) - before), language).toBeLessThan(1);
    await context.close();
  }
});
