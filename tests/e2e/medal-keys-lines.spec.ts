import { test, expect } from '@playwright/test';

import { arrived } from './streamedPage';

// The card tables', craps', video poker's, the horse race's, the big wheel's, Calico Janken's, the High & Low Ladder's, Sic Bo's, Whale Isle Sugoroku's, the Candy Shop Medal Maze's and Video Keno's line of keys (MedalCenter/KeysHint.tsx): however narrow its column, it
// wraps between its parts and never inside one, so a key is never left at the end of a line with what it does on the
// next ("R で" / 「同じベット」), and no part is wider than the column, which would stick out of the cabinet and push the
// page sideways (Sugoroku's 「キー：Space か Enter でサイコロ（演出中はスキップ）・」 in a 320 px window). On a touch screen, which
// has no keys, it is not shown.

const TABLES = [
  ['blackjack', 'bj-keys'],
  ['baccarat', 'baccarat-keys'],
  ['three-card-poker', 'tcp-keys'],
  ['craps', 'craps-keys'],
  ['video-poker', 'vp-keys'],
  ['horse-race', 'hr-keys'],
  ['big-wheel', 'bw-keys'],
  ['janken', 'janken-keys'],
  ['high-low', 'hl-keys'],
  ['sic-bo', 'sb-keys'],
  ['sugoroku', 'sg-keys'],
  ['coin-maze', 'cm-keys'],
  ['keno', 'kn-keys'],
] as const;

/** How far the keys line's widest part sticks out of its column, in px: 0 or less when every part fits. */
const sticksOut = (page: import('@playwright/test').Page, testId: string) => page.getByTestId(testId).evaluate((line) => line.scrollWidth - line.clientWidth);

/** The parts of the keys line that break inside themselves, as they are laid out now. */
const splitParts = (page: import('@playwright/test').Page, testId: string) =>
  page.getByTestId(testId).evaluate((line) => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const text = nodes.map((n) => n.data).join('');
    const separator = text.includes(' · ') ? ' · ' : '・';
    /** The text node and offset of a character of the whole line. */
    const at = (index: number): [Text, number] => {
      let left = index;
      for (const node of nodes) {
        if (left <= node.data.length) return [node, left];
        left -= node.data.length;
      }
      const last = nodes[nodes.length - 1];
      return [last, last.data.length];
    };
    const broken: string[] = [];
    let start = 0;
    for (const part of text.split(separator)) {
      const range = document.createRange();
      range.setStart(...at(start));
      range.setEnd(...at(start + part.length));
      const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top).sort((a, b) => a - b);
      if (tops.filter((top, i) => i === 0 || top - tops[i - 1] > 6).length > 1) broken.push(part);
      start += part.length + separator.length;
    }
    return broken;
  });

for (const [game, testId] of TABLES) {
  test(`${game}: the keys line breaks only between its parts, on a desk and in a narrow window, in either language`, async ({ browser }) => {
    test.setTimeout(90_000);
    for (const language of ['en', 'ja'] as const) {
      for (const width of [1280, 1024, 375, 320]) {
        const context = await browser.newContext({ viewport: { width, height: 800 } });
        await context.addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
        const page = await context.newPage();
        await page.goto(`/games/${game}`);
        await arrived(page);
        await expect(page.getByTestId(testId)).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await splitParts(page, testId), `${game} ${language} ${width}`).toEqual([]);
        // A few px into the cabinet's padding is a part that just fits, as an engine rounds it (Safari draws Baccarat's and the
        // ladder's 3 px wider than their 320 / 375 px columns); a part that does not fit sticks out by a word or more.
        expect(await sticksOut(page, testId), `${game} ${language} ${width}: a part wider than the column`).toBeLessThanOrEqual(4);
        await context.close();
      }
    }
    // A phone has no keys: the line is not shown there.
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await phone.newPage();
    await page.goto(`/games/${game}`);
    await arrived(page);
    await expect(page.getByTestId(testId)).toBeHidden();
    await phone.close();
  });
}
