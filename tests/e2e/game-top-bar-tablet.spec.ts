import { test, expect, type Page } from './fixtures';
import { arrived } from './streamedPage';

// Tablets, 768-1023px. The site toolbar used to be one row here, with the game's stats and its extra content (a mode
// badge, a turn counter, level and lines) squeezed between the site name and the controls: the extra was cut to a
// stub ("A…" for Daifugo's "AI ×2 · Medium" at 768px) and the stats ran over the game's name. Now the stats and the
// extra have the second row, as on phones. These tests read where everything really is.

type Language = 'ja' | 'en';
type Box = { left: number; top: number; right: number; bottom: number };

/** The two rows measure 99px here (94px on a phone, where the controls are icons); a third row would be ~40px more. */
const TWO_ROWS = 104;

const apart = (a: Box, b: Box) => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;

interface Game {
  slug: string;
  start: (page: Page, language: Language) => Promise<void>;
  extraText: Record<Language, RegExp>;
}

const games: Game[] = [
  {
    slug: 'daifugo',
    start: async (page, language) => {
      const ja = language === 'ja';
      await page.getByRole('button', { name: ja ? 'AI対戦 (3〜6人)' : 'Play vs AI (3–6 players)', exact: true }).click();
      await page.getByRole('button', { name: ja ? 'ゲーム開始' : 'Start Game', exact: true }).click();
    },
    // The longest badge of the games: the number of AI players and the difficulty.
    extraText: { ja: /AI ×\d · \S+/, en: /AI ×\d · \S+/ },
  },
  {
    slug: 'tetris',
    start: async (page) => {
      await page.locator('section[class*="selector"] button').last().click();
    },
    extraText: { ja: /レベル\s*1\s*ライン\s*0/, en: /Level\s*1\s*Lines\s*0/ },
  },
];

const screens = [
  { width: 768, height: 1024 },
  { width: 834, height: 1112 },
] as const;

async function open(page: Page, game: Game, language: Language, baseURL = 'http://localhost:3000') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: baseURL }]);
  await page.goto(`/games/${game.slug}`);
  await arrived(page);
  await game.start(page, language);
}

for (const screen of screens) {
  for (const language of ['en', 'ja'] as const) {
    for (const game of games) {
      test(`${game.slug} at ${screen.width}×${screen.height} (${language}): the extra content is whole, and clear of everything else in the toolbar`, async ({ page, baseURL }) => {
        await page.setViewportSize(screen);
        await open(page, game, language, baseURL);

        const extra = page.locator('[data-game-top-bar-extra]');
        await expect(extra).toBeVisible();
        await expect(extra).toHaveText(game.extraText[language]);
        await page.evaluate(() => window.scrollTo(0, 0));

        const seen = await extra.evaluate((element) => {
          const box = (target: Element) => {
            const { left, top, right, bottom } = target.getBoundingClientRect();
            return { left, top, right, bottom };
          };
          const bar = element.closest('div[class*="toolbar"].sticky.top-0')!;
          const extraBox = box(element);
          // Cut off: anything in it wider than its own box, or reaching past the extra's edge.
          const cut = [element, ...element.querySelectorAll('*')]
            .filter((part) => part.scrollWidth > part.clientWidth + 1 || box(part).right > extraBox.right + 0.5 || box(part).left < extraBox.left - 0.5)
            .map((part) => `${part.tagName.toLowerCase()} "${part.textContent?.trim()}" ${part.scrollWidth}>${part.clientWidth}`);

          const info = bar.querySelector('button[class*="infoButton"]')!;
          const infoBox = box(info);
          const shown = (target: Element | null): target is Element => {
            if (!target) return false;
            const { width, height } = target.getBoundingClientRect();
            return width > 0 && height > 0;
          };
          // Everything else in the bar: the site name, the Games link, the game's name, the stats, and every control
          // (How to play, the divider, theme, language, log in).
          const neighbours: Record<string, Element> = {};
          const named = {
            'site name': bar.querySelector('a[href="/"]'),
            'Games link': bar.querySelector('a[href="/games"]'),
            "game's name": bar.querySelector('span[title]'),
            stats: bar.querySelector('[class*="statsPill"]'),
          };
          for (const [name, target] of Object.entries(named)) if (shown(target)) neighbours[name] = target;
          [...bar.querySelector('[class*="controlsSlot"]')!.children].forEach((control, index) => {
            if (shown(control)) neighbours[`control ${index + 1} (${control.getAttribute('aria-label') ?? control.tagName.toLowerCase()})`] = control;
          });

          const boxes = Object.fromEntries(Object.entries(neighbours).map(([name, target]) => [name, box(target)]));
          return {
            bar: box(bar),
            extra: extraBox,
            cut,
            boxes,
            infoOnTop: info.contains(document.elementFromPoint((infoBox.left + infoBox.right) / 2, (infoBox.top + infoBox.bottom) / 2)),
            sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            width: innerWidth,
          };
        });

        expect(seen.cut, 'nothing in the extra content is cut off or ellipsised').toEqual([]);
        expect(seen.extra.bottom - seen.extra.top, 'the extra content is one line').toBeLessThanOrEqual(36);
        expect(seen.extra.left, 'the extra content is on the screen').toBeGreaterThanOrEqual(0);
        expect(seen.extra.right, 'the extra content is on the screen').toBeLessThanOrEqual(seen.width);
        expect(seen.extra.top, 'the extra content is inside the toolbar').toBeGreaterThanOrEqual(seen.bar.top);
        expect(seen.extra.bottom, 'the extra content is inside the toolbar').toBeLessThanOrEqual(seen.bar.bottom);
        expect(seen.bar.bottom - seen.bar.top, 'the toolbar is two rows and no taller').toBeLessThanOrEqual(TWO_ROWS);

        const names = Object.keys(seen.boxes);
        expect(names).toEqual(expect.arrayContaining(['site name', 'Games link', "game's name", 'stats']));
        for (const name of names) {
          expect(apart(seen.extra, seen.boxes[name]), `the extra content is clear of the ${name}`).toBe(true);
          expect(seen.boxes[name].right, `the ${name} is on the screen`).toBeLessThanOrEqual(seen.width);
        }
        for (let a = 0; a < names.length; a++) {
          for (let b = a + 1; b < names.length; b++) {
            expect(apart(seen.boxes[names[a]], seen.boxes[names[b]]), `the ${names[a]} is clear of the ${names[b]}`).toBe(true);
          }
        }
        expect(seen.infoOnTop, 'a tap on How to play lands on it').toBe(true);
        expect(seen.sideways, 'the page does not scroll sideways').toBeLessThanOrEqual(0);
      });
    }
  }
}
