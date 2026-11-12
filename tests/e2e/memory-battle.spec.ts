import { test, expect, type Locator, type Page } from './fixtures';

import { getStrings } from '../../src/components/game/MemoryBattle/i18n';
import { arrived } from './streamedPage';

// Memory Battle's cards are only worth anything seen: a card is a button holding a flip container that holds a back
// ("?") and a front (the fruit), and which of the two shows is all CSS (a rotateY with backface-visibility). The game
// once shipped with the flip container laid out inline: the faces were 4×4px, nothing turned, and every card was a
// bare "?" from the first move to the end, with every unit test green. So this spec measures the faces and asks the
// browser which one is painted on top of each card.

const FRUIT = ['🍎', '🍋', '🍇', '🍒', '🥝', '🍑', '🍉', '🫐', '🥥', '🍍', '🥭', '🍓'];
const SIZES = { small: 12, medium: 16, large: 24 } as const;
type Size = keyof typeof SIZES;
type Language = 'en' | 'ja';

const cards = (page: Page) => page.getByTestId('mb-card');
const front = (card: Locator) => card.getByTestId('mb-card-front');
const back = (card: Locator) => card.getByTestId('mb-card-back');

async function openBoard(page: Page, baseURL: string | undefined, language: Language, size: Size) {
  const t = getStrings(language);
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: baseURL ?? 'http://localhost:3000' }]);
  expect((await page.goto('/games/memory-battle'))?.status()).toBe(200);
  await arrived(page);
  await page.getByRole('button', { name: t.grids[size] }).click();
  await page.getByRole('button', { name: t.startLabel }).click();
  await expect(cards(page)).toHaveCount(SIZES[size]);
}

/** Which face the browser paints on top at the middle of a card: 'mb-card-front', 'mb-card-back', or neither. */
const painted = (card: Locator) =>
  card.evaluate((cell) => {
    cell.scrollIntoView({ block: 'center', behavior: 'instant' });
    const box = cell.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.getAttribute('data-testid') ?? null;
  });

/**
 * A face fills its card: the same box as the button, and far from the 4×4px it once collapsed to. Looked at until it
 * does, since a face is narrower on screen while its card is still turning.
 */
async function fillsCard(face: Locator, card: Locator) {
  await expect(async () => {
    const [faceBox, cardBox] = [await face.boundingBox(), await card.boundingBox()];
    expect(faceBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect(faceBox!.width).toBeGreaterThan(20);
    expect(faceBox!.height).toBeGreaterThan(20);
    expect(Math.abs(faceBox!.width - cardBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(faceBox!.height - cardBox!.height)).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 5_000 });
}

async function showsFront(card: Locator, symbol: string) {
  await expect.poll(() => painted(card)).toBe('mb-card-front');
  await expect(front(card)).toBeVisible();
  await expect(front(card)).toHaveText(symbol);
  await fillsCard(front(card), card);
}

async function showsBack(card: Locator) {
  await expect.poll(() => painted(card)).toBe('mb-card-back');
  await expect(back(card)).toHaveText('?');
  await fillsCard(back(card), card);
}

/** Every card's fruit, read from the fronts in the page (they are there face down too, only turned away). */
async function fruitOf(page: Page): Promise<string[]> {
  const symbols = (await cards(page).getByTestId('mb-card-front').allTextContents()).map((s) => s.trim());
  for (const symbol of symbols) expect(FRUIT).toContain(symbol);
  for (const symbol of new Set(symbols)) expect(symbols.filter((s) => s === symbol)).toHaveLength(2);
  return symbols;
}

test('cards look like cards, a turned card shows its fruit, and the cleared board, the review and a new game all show what they should', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const t = getStrings('en');
  // Tall enough for the whole board, so that no card is ever scrolled out of sight while the page watches itself below.
  await page.setViewportSize({ width: 1280, height: 1200 });
  await openBoard(page, baseURL, 'en', 'small');
  const symbols = await fruitOf(page);
  const card = (index: number) => cards(page).nth(index);

  for (let i = 0; i < symbols.length; i++) {
    await expect(card(i)).toHaveAttribute('data-state', 'down');
    await showsBack(card(i));
    await expect(card(i)).toBeInViewport({ ratio: 1 });
  }

  // A click turns a card: its fruit is what is painted, card-sized, and the button is named after it.
  await card(0).click();
  await expect(card(0)).toHaveAttribute('data-state', 'up');
  await showsFront(card(0), symbols[0]);
  await expect(card(0)).toHaveAttribute('aria-label', symbols[0]);
  await showsBack(card(1 + symbols.slice(1).findIndex((s) => s === symbols[0])));

  // The next two seconds are watched from inside the page, every 50 ms, so that nothing is missed while this test is
  // busy: first the player's two cards face up together, then, once both have turned back, the AI's turn. Every card
  // not face down by then is one the AI turned (nothing is matched before this). A card counts as shown when its
  // fruit, card-sized, is what the browser paints at its middle.
  await page.evaluate(() => {
    const seen = { phase: 'player' as 'player' | 'ai', mine: 0, turned: 0, shown: 0, timer: 0 };
    (window as unknown as { mbSeen: typeof seen }).mbSeen = seen;
    seen.timer = window.setInterval(() => {
      const turned = [...document.querySelectorAll<HTMLElement>('[data-testid="mb-card"]:not([data-state="down"])')];
      const shown = turned.filter((cell) => {
        const box = cell.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return top?.getAttribute('data-testid') === 'mb-card-front' && top.getBoundingClientRect().width > 20;
      }).length;
      if (seen.phase === 'player') {
        seen.mine = Math.max(seen.mine, shown);
        if (seen.mine === 2 && turned.length === 0) seen.phase = 'ai';
        return;
      }
      seen.turned = Math.max(seen.turned, turned.length);
      seen.shown = Math.max(seen.shown, shown);
    }, 50);
  });
  const seen = () => page.evaluate(() => (window as unknown as { mbSeen: { mine: number; turned: number; shown: number } }).mbSeen);

  // A second card that does not match: both fruits show, then both turn back.
  const other = symbols.findIndex((s) => s !== symbols[0]);
  await card(other).click();
  await expect.poll(async () => (await seen()).mine).toBe(2);
  await expect(card(0)).toHaveAttribute('data-state', 'down');
  await expect(card(other)).toHaveAttribute('data-state', 'down');
  await showsBack(card(0));
  await showsBack(card(other));

  // The AI's two cards were shown as well.
  await expect.poll(async () => (await seen()).turned, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await seen()).shown).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => window.clearInterval((window as unknown as { mbSeen: { timer: number } }).mbSeen.timer));

  // Take every pair left (a pair keeps the turn, so the AI moves again only if it is still in its first turn). A
  // taken pair stays face up.
  for (let a = 0; a < symbols.length; a++) {
    const b = symbols.indexOf(symbols[a], a + 1);
    if (b < 0) continue;
    // The player's turn (a card can be pressed), or the AI has just taken the last pair.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('[data-testid="mb-card"]:enabled') !== null || document.querySelector('[data-testid="mb-card"]:not([data-state="matched"])') === null), { timeout: 20_000 })
      .toBe(true);
    if ((await card(a).getAttribute('data-state')) === 'matched') continue;
    await card(a).click();
    await card(b).click();
    await expect(card(a)).toHaveAttribute('data-state', 'matched');
    await expect(card(b)).toHaveAttribute('data-state', 'matched');
    await showsFront(card(a), symbols[a]);
    await showsFront(card(b), symbols[a]);
  }

  // Game over: the whole board is face up, and the review is there.
  await expect(page.getByRole('heading', { name: t.reviewTitle })).toBeVisible();
  for (let i = 0; i < symbols.length; i++) {
    await expect(card(i)).toHaveAttribute('data-state', 'matched');
    await showsFront(card(i), symbols[i]);
  }
  await expect(page.getByRole('list', { name: t.turnLogLabel }).getByRole('listitem').first()).toBeVisible();

  // Play again: a fresh board, all face down, and the first number key turns the first card.
  await page.getByRole('button', { name: t.playAgain }).click();
  await expect(page.getByRole('heading', { name: t.reviewTitle })).toHaveCount(0);
  await expect(cards(page).and(page.locator('[data-state="down"]'))).toHaveCount(SIZES.small);
  const again = await fruitOf(page);
  for (let i = 0; i < again.length; i++) await showsBack(card(i));
  await page.keyboard.press('1');
  await expect(card(0)).toHaveAttribute('data-state', 'up');
  await showsFront(card(0), again[0]);
});

for (const size of ['medium', 'large'] as const) {
  test(`on a phone, in Japanese and with reduced motion, the ${size} board's cards and a turned card's fruit are card-sized`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBoard(page, baseURL, 'ja', size);
    const symbols = await fruitOf(page);
    for (let i = 0; i < symbols.length; i++) await showsBack(cards(page).nth(i));
    const last = symbols.length - 1;
    await cards(page).nth(last).click();
    await showsFront(cards(page).nth(last), symbols[last]);
    await expect(cards(page).nth(last)).toHaveAttribute('aria-label', symbols[last]);
  });
}
