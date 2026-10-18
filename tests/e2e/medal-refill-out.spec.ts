import { test, expect, type Page } from '@playwright/test';

import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { WELCOME, createLedger, serializeLedger, take } from '../../src/components/game/MedalCenter/ledger';
import { bankBalance, openCenter, storedBank } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { arrived } from './streamedPage';

// No free refill while medals are out on a round ("Medals out" in MedalCenter/ledger.ts): a player whose last medals
// are on a video poker double-up still waiting for its pick has none to play with, and has not run out of them either.
// The medal center says where they are instead of offering the 100, and offers it once they are gone. The cards are
// drawn with Math.random, so the numbers each press uses are queued just before it, as video-poker-double-up.spec.ts
// does.

const RANKS = '23456789TJQKA';
/** "K♠" → the card's number. */
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);
/** A full house dealt, and the five cards a draw would bring: held whole, it wins 45 at five medals. */
const FULL_HOUSE = ['K♠', 'K♥', '7♦', '7♣', '7♠', '2♠', '3♥', '4♦', '5♣', '9♠'];

/** The random numbers the deal turns into exactly these ten cards. */
function dealNumbers(cards: string[]): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const out: number[] = [];
  cards.map(c).forEach((card, i) => {
    const j = deck.indexOf(card);
    out.push((j - i + 0.5) / (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  });
  return out;
}
/** The random number that turns `dealer` up as the dealer's card. */
const dealerNumber = (dealer: string) => (c(dealer) + 0.5) / 52;
/** The random numbers that make `card` the first of the four face-down cards. */
const firstNumbers = (dealer: string, card: string) => {
  const deck = Array.from({ length: 52 }, (_, i) => i).filter((x) => x !== c(dealer));
  return [(deck.indexOf(c(card)) + 0.5) / 51, 0.5, 0.5, 0.5];
};

/** Queues random numbers for the next presses; once they are used, Math.random is itself again. */
async function rig(page: Page, numbers: number[]) {
  await page.evaluate((queue) => {
    const w = window as unknown as { __random?: () => number };
    w.__random ??= Math.random;
    const left = [...queue];
    Math.random = () => (left.length > 0 ? left.shift()! : w.__random!());
  }, numbers);
}

/** A guest with five medals left: one five-medal hand, and everything it wins on a double-up. */
async function fiveMedalsLeft(page: Page) {
  const five = take(createLedger('testdevice01'), WELCOME - 5)!;
  await page.addInitScript(
    ([key, text]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text);
    },
    [BANK_KEY, serializeLedger(five)],
  );
}

async function openVideoPoker(page: Page) {
  await page.goto('/games/video-poker');
  await arrived(page);
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

/** The five medals on a full house, held whole and drawn (45 won), and the 45 put on a double-up against the ace of spades. */
async function lastMedalsOnADouble(page: Page) {
  await openVideoPoker(page);
  await expect(page.getByTestId('vp-medals')).toHaveText('5');
  await rig(page, dealNumbers(FULL_HOUSE));
  // Pressed until the hand is dealt, and never again once it is: a deal that has landed takes DEAL away.
  await pressUntil(page.getByRole('button', { name: 'DEAL', exact: true }), () => page.getByRole('button', { name: 'DRAW', exact: true }).isVisible());
  for (let i = 0; i < 5; i++) {
    const slot = page.locator(`[data-slot="${i}"]`);
    if ((await slot.getAttribute('aria-pressed')) !== 'true') await slot.click();
  }
  await page.getByRole('button', { name: 'DRAW', exact: true }).click();
  await expect(page.getByTestId('vp-message')).toHaveText('Full House! Won 45 medals');
  await rig(page, [dealerNumber('A♠')]);
  await page.getByTestId('vp-double-up').click();
  await expect(page.getByTestId('vp-message')).toHaveText('45 medals on the double: pick a card higher than the dealer’s.');
  await expect(page.getByTestId('vp-medals')).toHaveText('0');
  await expect.poll(() => bankBalance(page)).toBe(0);
}

/** Picks the first face-down card against the ace: a three, lower, and the 45 are gone. */
async function loseTheDouble(page: Page) {
  await expect(page.getByTestId('vp-dealer')).toHaveAttribute('aria-label', 'The dealer’s card: A♠');
  await rig(page, firstNumbers('A♠', '3♣'));
  await page.locator('[data-pick="0"]').click();
  await expect(page.getByTestId('vp-message')).toHaveText('Lower: the 45 medals on the double are gone.');
}

const OUT_EN = 'Some of your medals are still on a round at Video Poker. Finish it there and they come back to you; the free refill is for when none are left anywhere.';

test('no refill at the hub while the last medals are on a double-up: it says where they are, and gives the refill once they are lost', async ({ page }) => {
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await fiveMedalsLeft(page);
  await lastMedalsOnADouble(page);
  // The player walks over to the medal center with the 45 still on the double.
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText('0');
  await expect(page.getByTestId('center-refill')).toHaveCount(0);
  const out = page.getByTestId('center-out');
  await expect(out).toHaveText(OUT_EN);
  await expect(out).toHaveAttribute('data-out', 'video-poker');
  await expect(page.getByTestId('center-not-money')).toBeVisible();
  // Nothing was given behind the line either.
  expect(await bankBalance(page)).toBe(0);
  expect((await storedBank(page))?.era).toBe(0);
  // Its name goes to the machine, where the double still waits with its dealer's card.
  await out.getByRole('link', { name: 'Video Poker' }).click();
  await expect(page).toHaveURL(/\/games\/video-poker$/);
  await arrived(page);
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await loseTheDouble(page);
  // Lost: none are out any more, and nothing is left: the machine offers the refill itself, and so does the hub.
  await expect(page.getByTestId('vp-refill')).toBeVisible();
  await expect(page.getByTestId('vp-out')).toHaveCount(0);
  await openCenter(page);
  await expect(page.getByTestId('center-out')).toHaveCount(0);
  await page.getByTestId('center-refill').click();
  await expect(page.getByTestId('center-balance')).toHaveText('100');
  await expect.poll(() => bankBalance(page)).toBe(100);
});

test('the hub in another tab says so while the double waits, and offers the refill as soon as the double is lost', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await fiveMedalsLeft(page);
  await lastMedalsOnADouble(page);
  const hub = await context.newPage();
  await openCenter(hub);
  await expect(hub.getByTestId('center-out')).toHaveText(OUT_EN);
  await expect(hub.getByTestId('center-refill')).toHaveCount(0);
  // The card is picked in the machine's tab, and lost: the hub hears of it, and the refill is there.
  await page.bringToFront();
  await loseTheDouble(page);
  await hub.bringToFront();
  await expect(hub.getByTestId('center-out')).toHaveCount(0, { timeout: 15_000 });
  await expect(hub.getByTestId('center-refill')).toBeVisible();
  await hub.getByTestId('center-refill').click();
  await expect(hub.getByTestId('center-balance')).toHaveText('100');
  await expect.poll(() => bankBalance(hub)).toBe(100);
});

test('the line fits a phone, in Japanese, and says no word of money', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await fiveMedalsLeft(page);
  await lastMedalsOnADouble(page);
  await openCenter(page, 'ja');
  const out = page.getByTestId('center-out');
  await expect(out).toHaveText('ビデオポーカーで、まだメダルが勝負に出ています。そこで勝負を終えるとメダルが戻ります。無料のメダルは、どこにもメダルが残っていないときにもらえます。');
  await expect(out).not.toHaveText(/預け|預かり|引き出し|残高|お金/);
  await expect(page.getByTestId('center-refill')).toHaveCount(0);
  const box = (await out.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
