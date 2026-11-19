import { test, expect, type Page } from './fixtures';
import { arrived } from './streamedPage';

// Two leftovers of the game top bar, measured where they really are.
//
// Tablets, a game without extra content: the bar stays one row (several of these games have a full-viewport root that a
// taller bar would cover), and at 768-830px in English that row had too little room. The game's name chip was
// squeezed to its emoji and padding, a ~20px stub that sat under the stats pill. Now it is left out where it cannot
// show a readable part of the name, and cut with an ellipsis where it can.
//
// Phones, IQ Test and Jump: they put their own content in the toolbar rather than through GameTopBar. At 320px it
// wrapped ("How to play" a word per line, Jump's buttons on a row of their own) and the bar was 134-137px tall, over
// the game. Now it is the two rows every other game has.

type Language = 'ja' | 'en';
type Box = { left: number; top: number; right: number; bottom: number };

const apart = (a: Box, b: Box) => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;

async function open(page: Page, slug: string, language: Language, baseURL = 'http://localhost:3000') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: baseURL }]);
  await page.goto(`/games/${slug}`);
  await arrived(page);
}

/** Every part of the bar a player can see, by name, with where it is; and the bar's own size and the page's overflow. */
async function readBar(page: Page) {
  return page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const bar = document.querySelector('div[class*="toolbar"].sticky.top-0')!;
    const box = (target: Element) => {
      const { left, top, right, bottom } = target.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const shown = (target: Element | null): target is Element => {
      if (!target) return false;
      const { width, height } = target.getBoundingClientRect();
      return width > 0 && height > 0;
    };
    const parts: Record<string, Element> = {};
    const named = {
      'site name': bar.querySelector('a[href="/"]'),
      'Games link': bar.querySelector('a[href="/games"]'),
      "game's name": bar.querySelector('span[title]'),
      stats: bar.querySelector('[class*="statsPill"]'),
    };
    for (const [name, target] of Object.entries(named)) if (shown(target)) parts[name] = target;
    // The game's own pieces in the bar's middle (Jump's scores), each on its own.
    bar.querySelectorAll('[class*="gameCenter"] [class*="scorePill"], [class*="gameCenter"] [class*="stagePill"]').forEach((pill, index) => {
      if (shown(pill)) parts[`score pill ${index + 1}`] = pill;
    });
    // Every button the bar shows, wherever it sits (How to play is on the second row on the narrowest phones), and
    // every one of the site's controls.
    bar.querySelectorAll('[class*="gameCenter"] button').forEach((button, index) => {
      if (shown(button)) parts[`row 2 button ${index + 1} (${button.getAttribute('aria-label')})`] = button;
    });
    [...bar.querySelector('[class*="controlsSlot"]')!.children].forEach((control, index) => {
      if (shown(control)) parts[`control ${index + 1} (${control.getAttribute('aria-label') ?? control.tagName.toLowerCase()})`] = control;
    });

    const chipText = bar.querySelector('span[title] > .truncate');
    return {
      bar: box(bar),
      boxes: Object.fromEntries(Object.entries(parts).map(([name, target]) => [name, box(target)])),
      chipTextWidth: shown(parts["game's name"] ?? null) && chipText ? chipText.getBoundingClientRect().width : null,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      width: innerWidth,
    };
  });
}

function expectApart(boxes: Record<string, Box>, width: number) {
  const names = Object.keys(boxes);
  for (const name of names) {
    expect(boxes[name].left, `the ${name} is on the screen`).toBeGreaterThanOrEqual(0);
    expect(boxes[name].right, `the ${name} is on the screen`).toBeLessThanOrEqual(width);
  }
  for (let a = 0; a < names.length; a++) {
    for (let b = a + 1; b < names.length; b++) {
      expect(apart(boxes[names[a]], boxes[names[b]]), `the ${names[a]} is clear of the ${names[b]}`).toBe(true);
    }
  }
}

/** A tap in the middle of the button lands on it, not on something drawn over it. */
async function expectTappable(page: Page, name: string) {
  const button = page.locator('div[class*="toolbar"].sticky.top-0').getByRole('button', { name, exact: true });
  await expect(button).toBeVisible();
  const onTop = await button.evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(left + width / 2, top + height / 2));
  });
  expect(onTop, `a tap on ${name} lands on it`).toBe(true);
}

/** The one row on tablets measures 59px; a second row would be ~40px more. */
const ONE_ROW = 62;

const tabletGames = ['gomoku', 'tic-tac-toe'] as const;
const tablets = [
  { width: 768, height: 1024 },
  { width: 800, height: 1100 },
] as const;

for (const screen of tablets) {
  for (const slug of tabletGames) {
    test(`${slug} at ${screen.width}×${screen.height} (en): one row, with nothing in it on top of anything else`, async ({ page, baseURL }) => {
      await page.setViewportSize(screen);
      await open(page, slug, 'en', baseURL);
      await expect(page.locator('div[class*="toolbar"].sticky.top-0 [class*="statsPill"]')).toBeVisible();

      const seen = await readBar(page);
      expect(seen.bar.bottom - seen.bar.top, 'the toolbar is its one row').toBeLessThanOrEqual(ONE_ROW);
      expect(Object.keys(seen.boxes)).toEqual(expect.arrayContaining(['site name', 'Games link', 'stats']));
      expectApart(seen.boxes, seen.width);
      // The game's name, where it shows, shows a readable part of it (it was 20px wide: the emoji and the padding).
      if (seen.chipTextWidth !== null) expect(seen.chipTextWidth, "the game's name shows some letters").toBeGreaterThanOrEqual(30);
      expect(seen.sideways, 'the page does not scroll sideways').toBeLessThanOrEqual(0);
      await expectTappable(page, 'How to Play');
    });
  }
}

/** The two rows measure ~92-94px on a phone. The game's content wrapping made the bar 134-137px. */
const TWO_ROWS = 100;

const ownContentGames = [
  { slug: 'iq-test', info: { en: 'How to play', ja: '遊び方' }, more: { en: [] as string[], ja: [] as string[] } },
  { slug: 'jump-game', info: { en: 'How to Play', ja: '遊び方' }, more: { en: ['Sound'], ja: ['サウンド'] } },
] as const;

for (const language of ['en', 'ja'] as const) {
  for (const game of ownContentGames) {
    test(`${game.slug} at 320×640 (${language}): the toolbar is two rows, its content one line, clear of the site name`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, game.slug, language, baseURL);
      await expectTappable(page, game.info[language]);

      const seen = await readBar(page);
      expect(seen.bar.bottom - seen.bar.top, 'the toolbar is two rows and no taller').toBeLessThanOrEqual(TWO_ROWS);
      expect(Object.keys(seen.boxes)).toEqual(expect.arrayContaining(['site name']));
      // Each of the game's pieces is a single line: no taller than a pill (How to play was three lines, 82px).
      for (const [name, part] of Object.entries(seen.boxes)) {
        expect(part.bottom - part.top, `the ${name} is one line`).toBeLessThanOrEqual(36);
        expect(part.top, `the ${name} is inside the toolbar`).toBeGreaterThanOrEqual(seen.bar.top);
        expect(part.bottom, `the ${name} is inside the toolbar`).toBeLessThanOrEqual(seen.bar.bottom);
      }
      expectApart(seen.boxes, seen.width);
      expect(seen.sideways, 'the page does not scroll sideways').toBeLessThanOrEqual(0);
      for (const name of game.more[language]) await expectTappable(page, name);

      // The game starts below the toolbar, not behind it.
      const firstThing = page.locator(game.slug === 'iq-test' ? 'h1' : 'canvas').first();
      await expect(firstThing).toBeVisible();
      const top = await firstThing.evaluate((element) => element.getBoundingClientRect().top);
      expect(top, 'the game starts below the toolbar').toBeGreaterThanOrEqual(seen.bar.bottom);
    });
  }
}
