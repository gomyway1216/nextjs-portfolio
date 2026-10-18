import { test, expect, type Browser, type Locator } from '@playwright/test';

import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { refillParts } from '../../src/components/game/MedalCenter/KeysHint';
import { WELCOME, createLedger, serializeLedger, take } from '../../src/components/game/MedalCenter/ledger';
import { FLOOR_GAMES } from '../../src/lib/medalFloor/games';
import { holdFloor } from './layoutShift';
import { pressUntil } from './pressUntil';
import { arrived } from './streamedPage';

// Japanese on a phone is never broken inside a word: a machine's name (「スロットマシ｜ン」, 「スリーカードポー｜カー」),
// a baccarat spot (「バンカーペ｜ア」, 「プレイヤ｜ー」), the three card poker felt's printed rules (「ストレートフ｜ラッシュ5」),
// video poker's prompt (「ドロ｜ー」。」) and the refill (「もら｜う」) were. Each is laid out at 375 and 320 px and read
// line by line. The floor's API is faked; nothing reaches a real server.

const WIDTHS = [375, 320] as const;

/** A phone in Japanese, its floor faked, with `medals` left (the welcome medals when not given). */
async function phone(browser: Browser, width: number, medals?: number) {
  const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
  const page = await context.newPage();
  const floor = await holdFloor(page);
  floor.release();
  if (medals !== undefined) {
    const ledger = take(createLedger('testdevice01'), WELCOME - medals)!;
    await page.addInitScript(([key, text]) => window.localStorage.setItem(key, text), [BANK_KEY, serializeLedger(ledger)] as const);
  }
  return { context, page };
}

/** The lines `target`'s words are laid out on, as a player reads them (text a screen reader is kept from is left out). */
const linesOf = (target: Locator) =>
  target.evaluate(async (el) => {
    await document.fonts.ready;
    const lines: string[] = [];
    let top: number | null = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const hidden = node.parentElement?.closest('[aria-hidden="true"]');
      if (hidden && hidden !== el && el.contains(hidden)) continue;
      for (let i = 0; i < node.data.length; i++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = [...range.getClientRects()].find((r) => r.width > 0);
        if (!rect) continue;
        if (top === null || rect.top - top > rect.height / 2) {
          lines.push('');
          top = rect.top;
        }
        lines[lines.length - 1] += node.data[i];
      }
    }
    return lines.map((line) => line.trim()).filter(Boolean);
  });

for (const width of WIDTHS) {
  test(`every machine's name is on one line in Japanese at ${width} px`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await phone(browser, width);
    for (const game of FLOOR_GAMES) {
      expect((await page.goto(`/games/${game}`))?.status()).toBe(200);
      await arrived(page);
      const title = page.locator('h1').first();
      const lines = await linesOf(title);
      // The Big Wheel's name may take two lines, broken only where it allows (between 星まつり and ビッグホイール).
      if (game === 'big-wheel' && lines.length === 2) expect(lines, game).toEqual(['星まつり', 'ビッグホイール']);
      else expect(lines, `${game} at ${width} px`).toHaveLength(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), game).toBe(0);
    }
    await context.close();
  });

  test(`baccarat's spots and hand boxes keep their words whole in Japanese at ${width} px`, async ({ browser }) => {
    const { context, page } = await phone(browser, width);
    await page.goto('/games/baccarat');
    await arrived(page);
    const words = ['プレイヤー', 'バンカー', 'ペア', 'タイ', 'プレイヤーペア', 'バンカーペア', 'ドラゴン7', 'パンダ8'];
    const labels = page.locator('[data-bet] > span:first-child');
    await expect(labels).toHaveCount(7);
    for (const label of await labels.all()) {
      for (const line of await linesOf(label)) expect(words, `a spot's line 「${line}」 at ${width} px`).toContain(line);
    }
    // What a spot pays breaks only after its 「・」.
    for (const pays of await page.locator('[data-bet] > span:nth-child(2)').all()) {
      const lines = await linesOf(pays);
      for (const line of lines.slice(0, -1)) expect(line, `「${lines.join('｜')}」 at ${width} px`).toMatch(/・$/);
    }
    // The hand boxes over the cards say 「プレイヤー」 and 「バンカー」 whole, not cut short.
    const names = page.locator('[class*="handName"]');
    await expect(names).toHaveCount(2);
    for (const name of await names.all()) expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth), `${await name.textContent()} at ${width} px`).toBe(true);
    await context.close();
  });

  test(`the three card poker felt's rules break only between them in Japanese at ${width} px`, async ({ browser }) => {
    const { context, page } = await phone(browser, width);
    await page.goto('/games/three-card-poker');
    await arrived(page);
    const rules = page.locator('[class*="feltBonus"]');
    const lines = await linesOf(rules);
    expect(lines.join('')).toBe('アンティボーナス・ストレート1・スリーカード4・ストレートフラッシュ5');
    for (const line of lines.slice(0, -1)) expect(line, `a line of the felt at ${width} px`).toMatch(/・$/);
    await context.close();
  });

  test(`video poker's prompt keeps 「ドロー」 whole in Japanese at ${width} px`, async ({ browser }) => {
    const { context, page } = await phone(browser, width);
    await page.goto('/games/video-poker');
    await arrived(page);
    await expect(page.getByTestId('vp-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    const deal = page.getByRole('button', { name: 'ディール', exact: true });
    await pressUntil(deal, () => page.getByRole('button', { name: 'ドロー', exact: true }).isVisible());
    const message = page.getByTestId('vp-message');
    await expect(message).toContainText('ドロー');
    const lines = await linesOf(message);
    for (const line of lines) expect(line, `「${lines.join('｜')}」 at ${width} px`).not.toMatch(/^[ーァィゥェォッャュョ」。、]/);
    expect(lines.join('｜')).not.toMatch(/ド｜ロ|ドロ｜ー/);
    await context.close();
  });

  test(`the refill's words break only between its halves in Japanese at ${width} px`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await phone(browser, width, 0);
    for (const path of [...FLOOR_GAMES.map((game) => `/games/${game}`), '/games/medal-center']) {
      await page.goto(path);
      await arrived(page);
      const refill = page.getByRole('button', { name: /100枚.*もらう$/ });
      await expect(refill, path).toBeVisible({ timeout: 20_000 });
      const text = ((await refill.textContent()) ?? '').trim();
      const lines = await linesOf(refill);
      expect([[text], refillParts(text)], `${path} at ${width} px: 「${lines.join('｜')}」`).toContainEqual(lines);
    }
    await context.close();
  });
}
