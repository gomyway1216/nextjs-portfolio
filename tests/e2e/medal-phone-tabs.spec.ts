import { test, expect, type Locator } from './fixtures';

import { arrived } from './streamedPage';

// On the narrowest phones a machine's tabs (MedalCenter/tabs.module.css) and its short buttons keep each name on one
// line, in either language: 「テーブル」 was broken into 「テーブ」 / 「ル」 at 320 px, 「同じベット」 under DEAL into two
// lines. The tabs still fit the screen, with nothing to scroll sideways.

const MACHINES = [
  { game: 'blackjack', tabs: 3, buttons: { en: ['Clear record'], ja: ['記録を消す'] } },
  { game: 'baccarat', tabs: 3, buttons: { en: ['Rebet'], ja: ['同じベット'] } },
  { game: 'three-card-poker', tabs: 3, buttons: { en: ['Rebet'], ja: ['同じベット'] } },
  { game: 'craps', tabs: 3, buttons: { en: [], ja: [] } },
  { game: 'video-poker', tabs: 3, buttons: { en: [], ja: [] } },
  // These three took the floor's tabs later; roulette's were two rows on a phone in Japanese until its tabs were named
  // 「マーチン法」 and 「ハウスエッジ」, as the English names them ("Martingale", "House edge").
  { game: 'slot-machine', tabs: 3, buttons: { en: [], ja: [] } },
  { game: 'janken', tabs: 2, buttons: { en: [], ja: [] } },
  { game: 'roulette', tabs: 3, buttons: { en: [], ja: [] } },
  { game: 'high-low', tabs: 2, buttons: { en: ['START'], ja: ['スタート'] } },
  // Its layout's parts are chosen with radio buttons, not tabs: only the table's two tabs are tabs.
  { game: 'sic-bo', tabs: 2, buttons: { en: ['Same bets', 'Undo', 'Clear'], ja: ['同じベット', '戻す', 'クリア'] } },
  { game: 'sugoroku', tabs: 2, buttons: { en: ['ROLL', 'Skip'], ja: ['サイコロをふる', 'スキップ'] } },
  // DROP and the lever are named for a screen reader by what they do (their names begin with the words on them).
  { game: 'coin-maze', tabs: 2, buttons: { en: ['Drop a medal in', 'Skip'], ja: ['メダルを入れる（1枚）', 'スキップ'] } },
  // The board's halves are chosen with radio buttons, not tabs. Quick pick is named for a screen reader by what it does.
  { game: 'keno', tabs: 2, buttons: { en: ['Quick pick: 5 numbers at random', 'Erase', 'Same spots', 'Skip'], ja: ['クイックピック：数字を5個ランダムにえらぶ', '消す', '同じ数字', 'スキップ'] } },
  // START is named for a screen reader with what a play takes (its name begins with the word on it).
  { game: 'smart-ball', tabs: 2, buttons: { en: ['START: 5 medals for 10 marbles', 'Skip'], ja: ['スタート（5枚で玉10個）', 'スキップ'] } },
  // COUNT is named for a screen reader with what it does (its name begins with the word on it). LEND is a coin plate
  // of two lines on purpose, its word over what it lends.
  { game: 'pachinko', tabs: 2, buttons: { en: ['Count the balls back into medals, 10 to a medal', 'Skip'], ja: ['計数（10玉でメダル1枚）', 'スキップ'] } },
  // RETURN is named for a screen reader by what it does (its name begins with the word on it). DROP is a plate of two
  // lines on purpose, its word over "hold for more".
  { game: 'carousel-pusher', tabs: 2, buttons: { en: ['Return the medals in the slot to your medals'], ja: ['返却：クレジットのメダルを持ちメダルに戻す'] } },
  // START is named for a screen reader with what a play takes (its name begins with the word on it). FIRE stands the
  // five bands of the sway beside its word, as Smart Ball's plunger stands its gauge.
  { game: 'shooting-gallery', tabs: 2, buttons: { en: ['START: 6 medals for 6 corks', 'Skip'], ja: ['スタート（6枚でコルク6発）', 'スキップ'] } },
] as const;

/** How many lines the words of an element take: the tops of its boxes that are more than half a line apart. */
const lines = (target: Locator) =>
  target.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top).sort((a, b) => a - b);
    return tops.filter((top, i) => i === 0 || top - tops[i - 1] > 6).length;
  });

for (const { game, tabs: tabCount, buttons } of MACHINES) {
  test(`${game}: on the narrowest phones each tab and short button says its name on one line, in either language`, async ({ browser }) => {
    test.setTimeout(90_000);
    for (const language of ['en', 'ja'] as const) {
      for (const width of [320, 375]) {
        const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
        await context.addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
        const page = await context.newPage();
        await page.goto(`/games/${game}`);
        await arrived(page);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const where = `${game} ${language} ${width}`;
        const tabs = page.getByRole('tab');
        await expect(tabs).toHaveCount(tabCount);
        for (const tab of await tabs.all()) expect(await lines(tab), `${where} ${await tab.textContent()}`).toBe(1);
        // The tabs are one row.
        const tops = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
        expect(Math.max(...tops) - Math.min(...tops), `${where}: the tabs are one row`).toBeLessThanOrEqual(1);
        // The tabs fit the screen, and nothing on the page scrolls sideways.
        const right = await page.getByRole('tablist').evaluate((el) => el.getBoundingClientRect().right);
        expect(right, where).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), where).toBeLessThanOrEqual(width);
        for (const name of buttons[language]) {
          const button = page.getByRole('button', { name, exact: true });
          await expect(button).toBeVisible();
          expect(await lines(button), `${where} ${name}`).toBe(1);
        }
        await context.close();
      }
    }
  });
}
