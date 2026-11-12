import { test, expect, type Locator, type Page } from './fixtures';

import { getStrings } from '../../src/components/game/BiggerNumber/i18n';
import { instantScroll } from './instantScroll';
import { arrived } from './streamedPage';

// Bigger Number on a phone. Its screens used to be fixed, full-viewport layers, which put each one's top row (the back
// link, the mode-select button, Leave and the round counter) underneath the site's sticky toolbar: drawn there, and
// not clickable. These tests look at where those controls really are and press them where they are.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ context }) => {
  await instantScroll(context);
});

const MENU = { ja: { ai: 'AI対戦', back: '← ゲーム一覧へ' }, en: { ai: 'Play vs AI', back: '← Back to Games' } } as const;

/**
 * Where `target` is, and whether a tap there would land on it: wholly inside the window, below the site toolbar, and
 * the topmost element at its centre and near each end.
 */
async function place(target: Locator) {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const bar = document.querySelector('[class*="GlobalToolbar"]')?.getBoundingClientRect().bottom ?? 0;
    const points = [
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + box.width * 0.15, box.top + box.height / 2],
      [box.left + box.width * 0.85, box.top + box.height / 2],
      [box.left + box.width / 2, box.top + 3],
    ];
    return {
      top: box.top,
      bar,
      inWindow: box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth,
      belowBar: box.top >= bar,
      onTop: points.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && element.contains(hit);
      }),
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    };
  });
}

/** `target` is in sight with the page at its top, clear of the toolbar, and is what a tap on it hits. */
async function expectUncovered(page: Page, target: Locator, what: string) {
  await expect(target, what).toBeVisible();
  expect(await page.evaluate(() => window.scrollY), `${what}: the page opened scrolled`).toBe(0);
  // Polled: the menu is drawn again once the page knows its language, and a node let go of in between has no box.
  await expect
    .poll(async () => {
      const { inWindow, belowBar, onTop } = await place(target);
      return { inWindow, belowBar, onTop };
    }, what)
    .toEqual({ inWindow: true, belowBar: true, onTop: true });
  const at = await place(target);
  expect(at.bar, 'the site toolbar is on the page').toBeGreaterThan(40);
  return at;
}

const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'the page scrolls sideways').toBeLessThanOrEqual(0);

async function openMenu(page: Page, language: 'ja' | 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/bigger-number'))?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByRole('button', { name: MENU[language].ai })).toBeVisible();
}

for (const language of ['ja', 'en'] as const) {
  const t = getStrings(language);

  test(`the back and Leave buttons are clear of the site toolbar and work (${language})`, async ({ page }) => {
    await openMenu(page, language);

    // Menu: the link back to the games list.
    await expectUncovered(page, page.getByRole('link', { name: MENU[language].back }), 'the menu’s back link');
    await noSidewaysScroll(page);

    // Setup: the mode-select button, pressed where it is.
    await page.getByRole('button', { name: MENU[language].ai }).click();
    const modeSelect = page.getByRole('button', { name: `← ${t.modeSelect}` });
    const back = await expectUncovered(page, modeSelect, 'the setup screen’s back button');
    await noSidewaysScroll(page);
    await page.mouse.click(back.x, back.y);
    await expect(page.getByRole('button', { name: MENU[language].ai })).toBeVisible();

    // Table: the setup screen is taller than a phone, and wherever it was scrolled to, the table opens at its top.
    await page.getByRole('button', { name: MENU[language].ai }).click();
    const start = page.getByRole('button', { name: `▶ ${t.startMatch}` });
    await expect(start).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY), 'the setup screen fits a phone without scrolling').toBeGreaterThan(0);
    await start.click();

    const leave = page.getByRole('button', { name: t.leave });
    const leaveAt = await expectUncovered(page, leave, 'Leave');
    await expectUncovered(page, page.getByText(`${t.round} 1 / 10`), 'the round counter');
    await noSidewaysScroll(page);

    // A real tap on Leave ends the match.
    await page.mouse.click(leaveAt.x, leaveAt.y);
    await expect(page.getByRole('button', { name: MENU[language].ai })).toBeVisible();
    await expect(leave).toHaveCount(0);
  });
}

test('the tile the AI has just shown is struck off its tracker at once, and the hand does not move', async ({ page }) => {
  const t = getStrings('en');
  await openMenu(page, 'en');
  await page.getByRole('button', { name: MENU.en.ai }).click();
  await page.getByRole('button', { name: `▶ ${t.startMatch}` }).click();

  const hand = page.getByRole('group', { name: t.handLabel });
  const tracker = page.getByRole('list', { name: t.opponentTiles });
  await expect(tracker.getByRole('listitem')).toHaveCount(10);
  await expect(tracker.getByText('(played)')).toHaveCount(0);
  const handTop = () => hand.evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY));
  const before = await handTop();

  await hand.getByRole('button', { name: t.cardN(1), exact: true }).click();

  // The reveal, read in one look (it lasts 1.5 s): the result line names both tiles ("1 vs 7 — …", the AI's second),
  // and beside it what the tracker says and where the hand is.
  const reveal = await page
    .waitForFunction(
      ({ trackerName, handName }) => {
        const line = [...document.querySelectorAll('[role="status"]')].map((element) => element.textContent ?? '').find((text) => /^(\d|龍) vs (\d|龍) — /.test(text));
        const tiles = document.querySelector(`ul[aria-label="${trackerName}"]`);
        const cards = document.querySelector(`[role="group"][aria-label="${handName}"]`);
        if (!line || !tiles || !cards) return null;
        return {
          line,
          // Each tile's screen-reader label: "Tile 7 (played)" or "Tile 7 (in hand)".
          tiles: [...tiles.querySelectorAll('li > span')].map((element) => element.textContent ?? ''),
          handTop: Math.round(cards.getBoundingClientRect().top + window.scrollY),
        };
      },
      { trackerName: t.opponentTiles, handName: t.handLabel },
    )
    .then((handle) => handle.jsonValue());
  if (!reveal) throw new Error('the round was never shown');
  const shown = reveal.line.match(/ vs (\d|龍) — /)?.[1] ?? '';
  const tile = shown === '龍' ? t.dragonCard : t.cardN(Number(shown));

  // A tie under the default rule hands both tiles back, so only then does the tile stay in the AI's hand.
  const tied = reveal.line.includes(t.tieReturned);
  expect(reveal.tiles).toContain(tied ? t.tileInHand(tile) : t.tilePlayed(tile));
  expect(reveal.tiles.filter((label) => label.endsWith('(played)'))).toHaveLength(tied ? 0 : 1);
  expect(reveal.handTop, 'the hand moved when the round was shown').toBe(before);

  // Next round: still where it was, with the first round in the log.
  await expect(page.getByText(t.pickPrompt)).toBeVisible();
  expect(await handTop(), 'the hand moved when the log gained a round').toBe(before);
  await expect(page.getByRole('region', { name: t.roundLog }).getByRole('listitem')).toHaveCount(1);
});
