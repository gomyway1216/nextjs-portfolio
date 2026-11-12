import { test, expect, type Page } from './fixtures';
import { arrived } from './streamedPage';

// A phone. The site toolbar is two rows here: the site name and its controls, then the game's stats.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });

/**
 * The two rows measure 94px. A game's extra content (a mode badge, a turn counter) used to be squeezed into the sliver
 * beside the site name and wrap a character per line, which made the sticky bar 115-200px tall, over the game.
 */
const TWO_ROWS = 100;

type Box = { left: number; top: number; right: number; bottom: number };

const apart = (a: Box, b: Box) => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;

async function expectCompactBar(page: Page, extraText: RegExp) {
  const extra = page.locator('[data-game-top-bar-extra]');
  await expect(extra).toBeVisible();
  await expect(extra).toHaveText(extraText);
  await page.evaluate(() => window.scrollTo(0, 0));

  const seen = await page.evaluate(() => {
    const box = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const extra = document.querySelector('[data-game-top-bar-extra]')!;
    const bar = extra.closest('.sticky')!;
    const info = bar.querySelector('button[class*="infoButton"]')!;
    const infoBox = box(info);
    return {
      bar: box(bar),
      extra: box(extra),
      info: infoBox,
      pill: box(bar.querySelector('[class*="statsPill"]')!),
      home: box(bar.querySelector('a[href="/"]')!),
      infoOnTop: info.contains(document.elementFromPoint((infoBox.left + infoBox.right) / 2, (infoBox.top + infoBox.bottom) / 2)),
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      width: innerWidth,
    };
  });

  expect(seen.bar.bottom - seen.bar.top, 'the toolbar is its two rows and no taller').toBeLessThanOrEqual(TWO_ROWS);
  // One line of text, not a column of single characters: far wider than it is tall, and no taller than a pill.
  expect(seen.extra.bottom - seen.extra.top, 'the extra content is one line').toBeLessThanOrEqual(36);
  expect(seen.extra.right - seen.extra.left, 'the extra content is laid out along the row').toBeGreaterThan(seen.extra.bottom - seen.extra.top);
  expect(seen.extra.left, 'the extra content is on the screen').toBeGreaterThanOrEqual(0);
  expect(seen.extra.right, 'the extra content is on the screen').toBeLessThanOrEqual(seen.width);
  expect(seen.extra.bottom, 'the extra content is inside the toolbar').toBeLessThanOrEqual(seen.bar.bottom);
  expect(apart(seen.extra, seen.info), 'the extra content is clear of How to play').toBe(true);
  expect(apart(seen.extra, seen.pill), 'the extra content is clear of the stats').toBe(true);
  expect(apart(seen.extra, seen.home), 'the extra content is clear of the site name').toBe(true);
  expect(apart(seen.info, seen.home), 'How to play is clear of the site name').toBe(true);
  expect(seen.infoOnTop, 'a tap on How to play lands on it').toBe(true);
  expect(seen.sideways, 'the page does not scroll sideways').toBeLessThanOrEqual(0);
}

async function open(page: Page, path: string, baseURL = 'http://localhost:3000') {
  await page.context().addCookies([{ name: 'i18nextLng', value: 'ja', url: baseURL }]);
  await page.goto(path);
  await arrived(page);
}

test('animal roleplay: the turn counter is one line in a two-row toolbar, and the page header is below it', async ({ page, baseURL }) => {
  await open(page, '/games/animal-roleplay', baseURL);
  await expectCompactBar(page, /1\s*\/\s*10/);

  // The game's own header (back link, title) is under the toolbar, not behind it.
  const barBottom = await page.locator('[data-game-top-bar-extra]').evaluate((element) => element.closest('.sticky')!.getBoundingClientRect().bottom);
  for (const target of [page.locator('a[class*="backLink"]'), page.getByRole('heading', { level: 1 })]) {
    await expect(target).toBeVisible();
    const reached = await target.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, onTop: element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)) };
    });
    expect(reached.top).toBeGreaterThanOrEqual(barBottom);
    expect(reached.onTop).toBe(true);
  }
});

test('tetris: level and lines sit in a two-row toolbar once the game starts', async ({ page, baseURL }) => {
  await open(page, '/games/tetris', baseURL);
  await page.locator('section[class*="selector"] button').last().click();
  await expectCompactBar(page, /\d/);
});

test('mahjong: the round label is one line in a two-row toolbar', async ({ page, baseURL }) => {
  await open(page, '/games/mahjong', baseURL);
  await page.getByRole('button', { name: '東1局を開始' }).click();
  await expectCompactBar(page, /東1局/);
});

test('at 320px How to play has its own place and does not sit on the site name', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, '/games/animal-roleplay', baseURL);
  await expectCompactBar(page, /1/);
});
