import { test, expect, type Page } from './fixtures';

import { getMiniAdventureStrings } from '../../src/components/game/MiniAdventure/i18n';
import { instantScroll } from './instantScroll';
import { arrived } from './streamedPage';

// Mini Adventure on a phone. The dungeon screen used to be a fixed, full-viewport layer, so its first row (the HP,
// torch, attack and defence cards) sat underneath the site's sticky toolbar, which is two rows tall on a phone once
// the game has put its record in it: the player could not see their HP, and nothing could scroll it out.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ context }) => {
  await instantScroll(context);
});

async function enterDungeon(page: Page, language: 'ja' | 'en') {
  const t = getMiniAdventureStrings(language);
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/mini-adventure'))?.status()).toBe(200);
  await arrived(page);
  await page.getByRole('button', { name: t.start }).click();
  await expect(page.locator('[data-ma-hud]')).toBeVisible();
  return t;
}

/** Where the site toolbar ends, and each status card: its box, and whether it is the topmost thing all over itself. */
const hud = (page: Page) =>
  page.evaluate(() => {
    // The site toolbar, by the classes it has in every build: a production build names it `<hash>_toolbar`, with no
    // "GlobalToolbar" in it.
    const bar = document.querySelector('div[class*="toolbar"].sticky.top-0')?.getBoundingClientRect().bottom ?? 0;
    const cards = [...document.querySelectorAll('[data-ma-hud] > *')].map((card) => {
      const box = card.getBoundingClientRect();
      const points = [
        [box.left + box.width / 2, box.top + box.height / 2],
        [box.left + box.width / 2, box.top + 3],
        [box.left + 6, box.top + box.height / 2],
        [box.right - 6, box.bottom - 6],
      ];
      return {
        text: card.textContent ?? '',
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        inWindow: box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        onTop: points.every(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return hit !== null && card.contains(hit);
        }),
      };
    });
    return { bar, scrollY: window.scrollY, cards, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });

for (const language of ['ja', 'en'] as const) {
  test(`the HP, torch, attack and defence cards are in sight, clear of the site toolbar (${language})`, async ({ page }) => {
    const t = await enterDungeon(page, language);

    // The toolbar's second row (the game's win–loss record) is what made it taller than the cards' offset.
    await expect.poll(async () => (await hud(page)).bar).toBeGreaterThan(80);
    const seen = await hud(page);
    expect(seen.scrollY, 'the dungeon opened scrolled').toBe(0);
    expect(seen.cards).toHaveLength(4);
    for (const [index, label] of [t.hp, t.torch, t.attack, t.defense].entries()) {
      const card = seen.cards[index];
      expect(card.text, `card ${index + 1}`).toContain(label);
      expect(card.top, `${label}: under the toolbar`).toBeGreaterThanOrEqual(seen.bar);
      expect(card, label).toMatchObject({ inWindow: true, onTop: true });
    }
    // HP is a number the player can read: "30/30".
    expect(seen.cards[0].text).toMatch(/\d+\/\d+/);
    // All four on one line.
    expect(new Set(seen.cards.map((card) => card.top)).size).toBe(1);
    expect(seen.sideways, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  });
}

test('the d-pad stays where it is as the first messages arrive', async ({ page }) => {
  const t = await enterDungeon(page, 'en');
  const wait = page.getByRole('button', { name: t.wait, exact: true });
  const top = () => wait.evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY));
  const before = await top();
  const turn = page.locator('[data-ma-hud] + div');

  // Six turns: the log goes from two lines to full.
  for (let presses = 1; presses <= 6; presses++) {
    await wait.click();
    await expect(turn).toContainText(new RegExp(`\\b${presses}$`));
  }
  expect(await top(), 'the d-pad moved').toBe(before);
});
