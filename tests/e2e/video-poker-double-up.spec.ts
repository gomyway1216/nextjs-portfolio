import { test, expect, type Page } from '@playwright/test';

import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { bankBalance } from './medalCenterPage';
import { arrived } from './streamedPage';

// The double-up of video poker (doubleUp.ts): after a win the player may TAKE it, or DOUBLE UP: the dealer's card is
// turned face up and the player picks one of four face-down cards. Higher doubles the medals, the same rank leaves them,
// lower loses them. The cards are drawn with Math.random, so each test queues the numbers just before the press that
// uses them, as the other video poker tests do for the deal.

const RANKS = '23456789TJQKA';
/** "K♠" → the card's number. */
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);
/** A full house dealt, and the five cards a draw would bring: held whole, it wins 9 a medal, 45 at five medals. */
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

async function openVideoPoker(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  await page.goto('/games/video-poker');
  await arrived(page);
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const medals = async (page: Page) => Number((await page.getByTestId('vp-medals').textContent())?.replace(/,/g, ''));
const dealButton = (page: Page) => page.getByRole('button', { name: 'DEAL', exact: true });
const drawButton = (page: Page) => page.getByRole('button', { name: 'DRAW', exact: true });

/** Deals the full house at five medals, holds it whole and draws: 45 medals won, and in the medals. */
async function winFullHouse(page: Page) {
  await rig(page, dealNumbers(FULL_HOUSE));
  await expect(async () => {
    await dealButton(page).click({ timeout: 1_000 });
    await expect(drawButton(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  for (let i = 0; i < 5; i++) {
    const slot = page.locator(`[data-slot="${i}"]`);
    if ((await slot.getAttribute('aria-pressed')) !== 'true') await slot.click();
  }
  await drawButton(page).click();
  await expect(page.getByTestId('vp-message')).toHaveText('Full House! Won 45 medals');
  await expect(page.getByTestId('vp-win')).toHaveText('45');
  expect(await medals(page)).toBe(WELCOME - 5 + 45);
  await expect(page.getByTestId('vp-offer')).toHaveText('45 medals won: DOUBLE UP (4 left) or TAKE.');
}

/** DOUBLE UP with `dealer` coming up as the dealer's card: the 45 go out of the medals, onto the double. */
async function doubleUp(page: Page, dealer: string, stake = 45) {
  const before = await medals(page);
  await rig(page, [dealerNumber(dealer)]);
  await page.getByTestId('vp-double-up').click();
  await expect(page.getByTestId('vp-dealer')).toHaveAttribute('aria-label', `The dealer’s card: ${dealer.replace('T', '10')}`);
  await expect(page.getByTestId('vp-message')).toHaveText(`${stake} medals on the double: pick a card higher than the dealer’s.`);
  await expect(page.getByTestId('vp-win')).toHaveText(String(stake));
  expect(await medals(page)).toBe(before - stake);
  await expect(page.getByTestId('vp-double-up')).toBeDisabled();
  await expect(dealButton(page)).toBeDisabled();
}

/** Picks the first face-down card, which turns out to be `card`. */
async function pick(page: Page, dealer: string, card: string) {
  await rig(page, firstNumbers(dealer, card));
  await page.locator('[data-pick="0"]').click();
  await expect(page.locator('[data-pick="0"]')).toHaveAttribute('data-picked', 'true');
}

test('a double-up won: the 45 go out as the dealer’s card turns, and 90 come back for a higher card', async ({ page }) => {
  await openVideoPoker(page);
  await winFullHouse(page);
  await doubleUp(page, '2♠');
  await pick(page, '2♠', 'A♥');
  await expect(page.getByTestId('vp-message')).toHaveText('Higher! 90 medals now.');
  await expect(page.getByTestId('vp-win')).toHaveText('90');
  await expect.poll(() => medals(page)).toBe(WELCOME - 5 + 90);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 5 + 90);
  // The medals run in on the counter's LEDs.
  await expect.poll(() => page.getByTestId('vp-medals-led').evaluate((el) => Number((el as HTMLElement).dataset.shown)), { timeout: 4_000 }).toBe(WELCOME - 5 + 90);
  // Three double-ups are left, and it can be doubled again.
  await expect(page.getByTestId('vp-offer')).toHaveText('90 medals won: DOUBLE UP (3 left) or TAKE.');
  await expect(page.getByTestId('vp-double-up')).toBeEnabled();
});

test('a double-up lost: a lower card, and the 45 are gone', async ({ page }) => {
  await openVideoPoker(page);
  await winFullHouse(page);
  await doubleUp(page, 'A♠');
  await pick(page, 'A♠', '3♣');
  await expect(page.getByTestId('vp-message')).toHaveText('Lower: the 45 medals on the double are gone.');
  await expect(page.getByTestId('vp-win')).toHaveText('0');
  expect(await medals(page)).toBe(WELCOME - 5);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 5);
  await expect(page.getByTestId('vp-double-up')).toBeDisabled();
  await expect(page.getByTestId('vp-take')).toBeDisabled();
  await expect(page.getByTestId('vp-offer')).toHaveCount(0);
  await expect(dealButton(page)).toBeEnabled();
});

test('a push: the same rank, and the 45 stay; taken with T, and the next hand is dealt from them', async ({ page }) => {
  await openVideoPoker(page);
  await winFullHouse(page);
  await doubleUp(page, 'J♠');
  await pick(page, 'J♠', 'J♥');
  await expect(page.getByTestId('vp-message')).toHaveText('Same rank: the 45 medals stay.');
  await expect.poll(() => medals(page)).toBe(WELCOME - 5 + 45);
  await expect(page.getByTestId('vp-offer')).toHaveText('45 medals won: DOUBLE UP (3 left) or TAKE.');
  // T takes them, from the keyboard: nothing moves, and no more double-ups.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('t');
  await expect(page.getByTestId('vp-message')).toHaveText('45 medals taken.');
  await expect(page.getByTestId('vp-double-up')).toBeDisabled();
  expect(await medals(page)).toBe(WELCOME - 5 + 45);
  await expect(dealButton(page)).toBeEnabled();
  await dealButton(page).click();
  await expect(drawButton(page)).toBeVisible();
  expect(await medals(page)).toBe(WELCOME - 5 + 45 - 5);
});

test('a reload mid-double: the same dealer’s card is waiting, the medals still on it, no deal over it, and it is settled once', async ({ page }) => {
  await openVideoPoker(page);
  await winFullHouse(page);
  await doubleUp(page, '9♣');
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('vp-dealer')).toHaveAttribute('aria-label', 'The dealer’s card: 9♣');
  await expect(page.getByTestId('vp-message')).toHaveText('45 medals on the double: pick a card higher than the dealer’s.');
  expect(await medals(page)).toBe(WELCOME - 5);
  await expect(dealButton(page)).toBeDisabled();
  // Picked with the keys: 1 is the first face-down card.
  await rig(page, firstNumbers('9♣', 'K♦'));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('1');
  await expect(page.getByTestId('vp-message')).toHaveText('Higher! 90 medals now.');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 5 + 90);
  // Reloaded again: nothing more comes of it.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('vp-message')).toHaveText('Higher! 90 medals now.');
  await page.waitForTimeout(500);
  expect(await bankBalance(page)).toBe(WELCOME - 5 + 90);
  expect(await medals(page)).toBe(WELCOME - 5 + 90);
});

test('fits a phone: the dealer’s card and the four to pick from in one row, DOUBLE UP and TAKE a thumb’s size, in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  await winFullHouse(page);
  for (const id of ['vp-double-up', 'vp-take']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height, id).toBeGreaterThanOrEqual(44);
    expect(box.width, id).toBeGreaterThan(120);
  }
  await doubleUp(page, '5♦');
  const row = await page.evaluate(() => {
    const slots = [...document.querySelectorAll('[data-testid="vp-double"] > *')].map((el) => el.getBoundingClientRect());
    return {
      count: slots.length,
      oneRow: slots.every((r) => Math.abs(r.top - slots[0].top) < 1),
      overlap: slots.some((r, i) => i > 0 && r.left < slots[i - 1].right - 0.5),
      narrowest: Math.min(...slots.map((r) => r.width)),
      sideways: document.documentElement.scrollWidth,
    };
  });
  expect(row).toMatchObject({ count: 5, oneRow: true, overlap: false });
  expect(row.narrowest).toBeGreaterThanOrEqual(44);
  expect(row.sideways).toBeLessThanOrEqual(375);
  await pick(page, '5♦', '5♣');
  await expect(page.getByTestId('vp-message')).toHaveText('Same rank: the 45 medals stay.');

  // In Japanese.
  await openVideoPoker(page, 'ja');
  await expect(page.getByTestId('vp-double-up')).toHaveText('ダブルアップ');
  await expect(page.getByTestId('vp-take')).toHaveText('受け取る');
  await expect(page.getByTestId('vp-offer')).toHaveText('45枚獲得：ダブルアップ（あと3回）か、受け取るか。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('played from the keys with the sound on: D doubles up, the dealer’s card is heard turning, 1 picks, and a win is heard', async ({ page }) => {
  // Every sound the page starts is noted (machineSounds.ts plays each as an AudioBufferSourceNode).
  await page.addInitScript(() => {
    const w = window as unknown as { __sounds: number[] };
    w.__sounds = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>) {
      w.__sounds.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
  });
  const heard = () => page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds.length);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVideoPoker(page);
  await winFullHouse(page);
  await page.getByTestId('vp-sound').click();
  await expect.poll(heard).toBe(1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await rig(page, [dealerNumber('8♥')]);
  await page.keyboard.press('d');
  await expect(page.getByTestId('vp-dealer')).toHaveAttribute('aria-label', 'The dealer’s card: 8♥');
  // The press, and the dealer's card turning over.
  await expect.poll(heard).toBe(3);
  await rig(page, firstNumbers('8♥', 'Q♣'));
  await page.keyboard.press('1');
  await expect(page.getByTestId('vp-message')).toHaveText('Higher! 90 medals now.');
  // The card picked turning over, the jingle, and the medals chirping in.
  await expect.poll(heard).toBeGreaterThanOrEqual(5);
});
