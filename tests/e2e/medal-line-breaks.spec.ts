import { test, expect, type Browser, type Locator, type Page } from './fixtures';

import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { refillParts } from '../../src/components/game/MedalCenter/KeysHint';
import { nameWords } from '../../src/components/game/MedalCenter/floorPlan';
import { WELCOME, claimBonus, createLedger, serializeLedger, take } from '../../src/components/game/MedalCenter/ledger';
import { dayFrom, type Day } from '../../src/components/game/MedalPusher/records';
import { numberForFace, numberForLamp } from '../../src/components/game/Sugoroku/engine';
import { numbersFor as mazeNumbers } from '../../src/components/game/CoinMaze/engine';
import { numbersFor as kenoNumbers } from '../../src/components/game/Keno/engine';
import { numbersFor as smbNumbers, slotFor as smbSlot } from '../../src/components/game/SmartBall/engine';
import { numbersForBall as pkNumbers } from '../../src/components/game/Pachinko/engine';
import { FLOOR_GAMES } from '../../src/lib/medalFloor/games';
import { JACKPOT_WINS_SHOWN, type FloorJackpotView } from '../../src/lib/medalFloor/jackpot';
import { NAME_MAX } from '../../src/lib/medalFloor/names';
import type { FloorFeedEntry } from '../../src/lib/medalFloor/types';
import { emptyFloor, holdFloor } from './layoutShift';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
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
  test(`the medal center's cabinet names break only between their words in Japanese at ${width} px`, async ({ browser }) => {
    const { context, page } = await phone(browser, width);
    await page.goto('/games/medal-center');
    await arrived(page);
    const names = page.locator('[data-machine] h4');
    await expect(names).toHaveCount(FLOOR_GAMES.length);
    for (const name of await names.all()) {
      const id = await name.evaluate((el) => el.closest<HTMLElement>('[data-machine]')!.dataset.machine!);
      const text = ((await name.textContent()) ?? '').trim();
      // Where it may break: between its words, and at a space.
      const words = nameWords(id, text).flatMap((word) => word.split(/(?<= )/));
      const lines = (await linesOf(name)).map((line) => line.replace(/ /g, ''));
      expect(lines.join(''), id).toBe(text.replace(/ /g, ''));
      let at = 0;
      const ends = new Set(words.map((word) => (at += word.replace(/ /g, '').length)));
      let done = 0;
      for (const line of lines.slice(0, -1)) {
        done += line.length;
        expect(ends.has(done), `${id} at ${width} px: 「${lines.join('｜')}」`).toBe(true);
      }
    }
    await context.close();
  });

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

  test(`three card poker's spots keep their names whole, and baccarat's bet medals are one row, in Japanese at ${width} px`, async ({ browser }) => {
    const { context, page } = await phone(browser, width);
    await page.goto('/games/three-card-poker');
    await arrived(page);
    const labels = page.locator('[data-bet] > span:first-child');
    await expect(labels).toHaveCount(3);
    for (const label of await labels.all()) expect(await linesOf(label), `a spot at ${width} px`).toHaveLength(1);
    await page.goto('/games/baccarat');
    await arrived(page);
    const medals = page.getByRole('radiogroup', { name: 'ベット', exact: true }).getByRole('radio');
    await expect(medals).toHaveCount(5);
    // One row: their middles at one height (the chosen medal is drawn a little larger).
    const middles = await medals.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; }));
    expect(Math.max(...middles) - Math.min(...middles), `the bet medals at ${width} px: ${middles.join(', ')}`).toBeLessThan(4);
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

// ── The daily bonus, and the floor's moments, over days ─────────────────────

/** The words the daily bonus's lines are made of, none of which a line may be broken inside. */
const BONUS_WORDS = ['前回', 'あいた', '新しい', 'カード', 'なりました', 'ボーナス', '受け取れます', 'スタンプ', '押しました', 'いっぱい', '明日'];

/** The places in `lines` a word of `words` is broken, or a count from its 「枚」 or a digit from the next: none, as a list. */
function brokenInside(lines: readonly string[], words: readonly string[]): string[] {
  const joined = lines.join('｜');
  const broken = words.filter((word) => Array.from({ length: word.length - 1 }, (_, i) => `${word.slice(0, i + 1)}｜${word.slice(i + 1)}`).some((cut) => joined.includes(cut)));
  return [...broken, ...(joined.match(/[+\d,]｜[\d,枚]/g) ?? [])];
}

/** A day in Japan, `back` days before today, as the bank keeps it. */
const daysAgo = (back: number) => {
  const japan = new Date(Date.now() + 9 * 3_600_000 - back * 86_400_000);
  return dayFrom(japan.getUTCFullYear(), japan.getUTCMonth() + 1, japan.getUTCDate());
};

/** A guest's medals whose bonus was last taken on the days given, in Japan. */
const claimedOn = (days: readonly Day[]) => days.reduce((ledger, day) => claimBonus(ledger, day).ledger, createLedger('testdevice01'));

for (const width of WIDTHS) {
  test(`the daily bonus says what it says between phrases, never inside a word, in Japanese at ${width} px`, async ({ browser }) => {
    test.setTimeout(90_000);
    for (const [path, plate] of [
      ['/games/medal-center', 'center-bonus'],
      ['/games/medal-pusher', 'pusher-panel-machine'],
    ] as const) {
      // A player back after a few days away: a new card. Then one on the seventh day in a row, who fills it.
      for (const days of [[daysAgo(3)], [6, 5, 4, 3, 2, 1].map(daysAgo)]) {
        const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Tokyo' });
        await context.addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
        const page = await context.newPage();
        (await holdFloor(page)).release();
        await page.addInitScript(([key, text]) => window.localStorage.setItem(key, text), [BANK_KEY, serializeLedger(claimedOn(days))] as const);
        await page.goto(path);
        await arrived(page);
        const status = page.locator(path.endsWith('center') ? `[data-testid="${plate}"]` : `#${plate}`).getByTestId('pusher-bonus-status');
        await expect(status).toContainText(days.length === 1 ? '新しいカードになりました' : '7日目のボーナス');
        const said = [await linesOf(status)];
        if (days.length > 1) {
          await pressUntil(page.getByTestId('pusher-bonus-take').first(), async () => (await status.textContent())?.includes('いっぱい') ?? false);
          said.push(await linesOf(status));
        }
        for (const lines of said) expect(brokenInside(lines, BONUS_WORDS), `${path} at ${width} px: 「${lines.join('｜')}」`).toEqual([]);
        await context.close();
      }
    }
  });

  test(`the floor's moments keep a count with its 「枚」 in Japanese at ${width} px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
    const page = await context.newPage();
    const now = Date.now();
    const moment = (id: number, game: FloorFeedEntry['game'], label: string | null, medals: number, name: string | null, tag: string): FloorFeedEntry => ({ id, name, tag, game, label, medals, at: now - id * 60_000 });
    const feed = [moment(1, 'medal-pusher', 'jackpot', 1_500, null, '0042'), moment(2, 'slot-machine', 'seven3', 12_000, 'タマ', '1234'), moment(3, 'roulette', null, 3_564, 'ミケ', '0007')];
    (await holdFloor(page, () => ({ ...emptyFloor(), feed }))).release();
    await page.goto('/games/medal-center/rankings');
    await arrived(page);
    const moments = page.getByTestId('floor-moment');
    await expect(moments).toHaveCount(3);
    for (const text of await moments.locator('[class*="momentText"]').all()) {
      const lines = await linesOf(text);
      expect(brokenInside(lines, ['ジャックポット', 'そろって', '当たり']), `「${lines.join('｜')}」 at ${width} px`).toEqual([]);
    }
    await context.close();
  });
}

/** The longest name a player can choose, in Japanese with no space to break at. */
const LONGEST_NAME = Array.from('ながれぼしのおおあたりやさんです').slice(0, NAME_MAX).join('');

/** Every moment the floor can show, each won by the longest name, for a six-figure count. */
const LONGEST_MOMENTS: [FloorFeedEntry['game'], string | null][] = [
  ['big-wheel', 'wheel-bonus'],
  ['ball-bingo', 'full-card'],
  ['video-poker', 'straight-flush'],
  ['video-poker', 'royal'],
  ['fishing', 'harbor-lord'],
  ['fishing', 'treasure'],
  ['big-wheel', 'wheel-400'],
  ['slot-machine', 'bar3'],
  ['medal-pusher', 'floor-jackpot'],
  ['roulette', null],
];

for (const width of WIDTHS) {
  test(`the floor's longest moments and jackpot wins, by the longest name, stay inside their boxes in Japanese at ${width} px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
    const page = await context.newPage();
    const now = Date.now();
    const feed: FloorFeedEntry[] = LONGEST_MOMENTS.map(([game, label], i) => ({ id: 100 - i, name: LONGEST_NAME, tag: '0001', game, label, medals: 123_456, at: now - (i + 1) * 60_000 }));
    (await holdFloor(page, () => ({ ...emptyFloor(), feed }))).release();
    // Registered last, so it answers before holdFloor's: the pool's last wins, all by the longest name.
    await page.route(/\/api\/game\/medal-floor\/jackpot(\?|$)/, (route) => {
      const wins = Array.from({ length: JACKPOT_WINS_SHOWN }, (_, i) => ({ name: LONGEST_NAME, tag: '0001', game: 'medal-pusher' as const, medals: 123_456, at: now - (i + 1) * 86_400_000 }));
      const view: FloorJackpotView = { now, available: true, amount: 1_234_567, seq: 9, v: 9, wins };
      return route.fulfill({ json: view });
    });
    for (const path of ['/games/medal-center/rankings', '/games/medal-center']) {
      await page.goto(path);
      await arrived(page);
      await expect(page.getByTestId('floor-moment').first()).toContainText(LONGEST_NAME);
      if (path.endsWith('rankings')) await expect(page.getByTestId('jackpot-win')).toHaveCount(JACKPOT_WINS_SHOWN);
      else await expect(page.getByTestId('jackpot-last').first()).toContainText(LONGEST_NAME);
      // Nothing scrolls sideways, and no line of a moment or a win runs out of its box, or its box out of the page.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path} at ${width} px`).toBe(0);
      const spills = await page.locator('[data-testid="floor-moment"], [data-testid="jackpot-win"], [data-testid="jackpot-last"]').evaluateAll((boxes, viewport) =>
        boxes.flatMap((box) => {
          const outer = box.getBoundingClientRect();
          const parts = [box, ...box.querySelectorAll<HTMLElement>('span, bdi, time')];
          return parts
            .filter((part) => {
              // An inline box has no width of its own to scroll (Firefox gives it a scrollWidth all the same): only its edges count.
              const scrolls = getComputedStyle(part).display !== 'inline' && part.scrollWidth > part.clientWidth + 1;
              const r = part.getBoundingClientRect();
              return scrolls || r.right > outer.right + 0.5 || r.left < outer.left - 0.5 || outer.right > viewport + 0.5;
            })
            .map((part) => `${part.className || part.tagName}: 「${part.textContent}」`);
        }),
      width);
      expect(spills, `${path} at ${width} px`).toEqual([]);
    }
    await context.close();
  });
}

// ── The High & Low Ladder and Moonlit Sic Bo ────────────────────────────────

/** The words of `words` that `lines` break inside, as 「…｜…」. */
const wordsBroken = (lines: readonly string[], words: readonly string[]): string[] => {
  const joined = lines.join('｜');
  return words.filter((word) => Array.from({ length: word.length - 1 }, (_, i) => `${word.slice(0, i + 1)}｜${word.slice(i + 1)}`).some((cut) => joined.includes(cut)));
};

/** Each of `target`'s elements read line by line, with the words of `words` any of them breaks inside. */
async function brokenIn(target: Locator, words: readonly string[]): Promise<string[]> {
  const found: string[] = [];
  for (const element of await target.all()) {
    const lines = await linesOf(element);
    if (wordsBroken(lines, words).length > 0) found.push(`「${lines.join('｜')}」`);
  }
  return found;
}

const HL_WORDS = ['段目', 'テイク', '予想', '引き分け', 'ハズレ', 'ラダー', 'ここまで', '最善手', '戻り', '当たり', 'カード', '有利'];
const SB_WORDS = ['いちばん', '戻る', 'エリア', '少ない', '合計', 'ゾロ目', '選ぶ', '通り', '倍率', '取り分'];
const hlCard = (rank: number, suit = 1) => (rank * 4 + suit + 0.5) / 52;

/**
 * Lays the page's lines out as Safari and Firefox do. Neither has `word-break: auto-phrase`, so where Chromium breaks a
 * line between phrases they fall back to the rule written under it, keep-all, and break only where the words carry a
 * break (a space, a zero-width space, 、。：). Here every element on auto-phrase is put on keep-all: in Chromium that is
 * how CI (Chromium alone) sees what an iPhone shows; in Safari and Firefox nothing is on auto-phrase, and nothing
 * changes. Sic Bo's 「いちばん戻るエリア」 beside 97.2% pushed the page 7 px sideways in WebKit and 16 px in Firefox at
 * 320 px, and so it does in Chromium laid out this way.
 */
async function asSafariBreaks(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('main *')) {
      if (getComputedStyle(el).wordBreak === 'auto-phrase') el.style.setProperty('word-break', 'keep-all', 'important');
    }
  });
}

/** How far the page reaches past the right edge of the screen, in px. */
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of WIDTHS) for (const safari of [false, true]) {
  const as = safari ? ', broken as Safari and Firefox break them' : '';
  test(`the High & Low Ladder's lines and its Odds tab's tables break between phrases in Japanese at ${width} px${as}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page } = await phone(browser, width);
    await page.goto('/games/high-low');
    await arrived(page);
    await expect(page.getByTestId('hl-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    if (safari) await asSafariBreaks(page);
    const status = page.getByTestId('hl-status');
    const said: string[] = [];
    // A 7, then a King (HIGH), then a 3 (LOW): the rungs' offers; then TAKE, and an 8 tied.
    await rigPresses(page, [hlCard(5)]);
    await pressUntil(page.getByTestId('hl-start'), async () => (await page.getByTestId('hl-machine').getAttribute('data-state')) === 'play');
    for (const [side, next, rung] of [
      ['high', hlCard(11), '1'],
      ['low', hlCard(1, 2), '2'],
    ] as const) {
      await rigPresses(page, [next]);
      await page.getByTestId(`hl-${side}`).click();
      await expect(page.getByTestId('hl-ladder')).toHaveAttribute('data-lit', rung);
      await expect(status).toContainText('予想');
      said.push(...(await brokenIn(status, HL_WORDS)));
    }
    await page.getByTestId('hl-take').click();
    await expect(page.getByTestId('hl-start')).toBeEnabled();
    await rigPresses(page, [hlCard(6, 0)]);
    await page.getByTestId('hl-start').click();
    await expect(page.getByTestId('hl-high')).toBeEnabled();
    await rigPresses(page, [hlCard(6, 3)]);
    await page.getByTestId('hl-high').click();
    await expect(status).toContainText('ここまで');
    said.push(...(await brokenIn(status, HL_WORDS)));
    said.push(...(await brokenIn(page.locator('#hl-session-title ~ dl dt'), HL_WORDS)));
    expect(await sideways(page), `the table at ${width} px${as}`).toBe(0);
    await page.getByRole('tab', { name: '確率' }).click();
    const odds = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(odds.locator('table').first()).toBeVisible();
    if (safari) await asSafariBreaks(page);
    said.push(...(await brokenIn(odds.locator('table th, table td, [class*="statLabel"]'), HL_WORDS)));
    expect(await sideways(page), `the Odds tab at ${width} px${as}`).toBe(0);
    expect(said, `at ${width} px${as}`).toEqual([]);
    await context.close();
  });

  test(`Moonlit Sic Bo's figures and its Odds tab's tables break between phrases in Japanese at ${width} px${as}`, async ({ browser }) => {
    const { context, page } = await phone(browser, width);
    await page.goto('/games/sic-bo');
    await arrived(page);
    if (safari) await asSafariBreaks(page);
    const said = await brokenIn(page.locator('#sb-stats-title ~ dl dt'), SB_WORDS);
    expect(await sideways(page), `the table at ${width} px${as}`).toBe(0);
    await page.locator('#sb-tab-odds').click();
    const odds = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(odds.getByTestId('sb-odds-table')).toBeVisible();
    if (safari) await asSafariBreaks(page);
    said.push(...(await brokenIn(odds.locator('table th, table td, [class*="statLabel"]'), SB_WORDS)));
    expect(await sideways(page), `the Odds tab at ${width} px${as}`).toBe(0);
    expect(said, `at ${width} px${as}`).toEqual([]);
    await context.close();
  });
}

// ── Whale Isle Sugoroku ─────────────────────────────────────────────────────

const SG_WORDS = ['サイコロ', 'ふろう', 'ベット', 'ランプチャンス', 'チャンス', 'くじら', 'ライド', 'スタート', '還元率', '持ちメダル', '当たり', '戻り', '割合', '回数', '差し引き', 'いちばん', 'ジャックポット'];

for (const width of WIDTHS) for (const safari of [false, true]) {
  const as = safari ? ', broken as Safari and Firefox break them' : '';
  test(`Whale Isle Sugoroku's status line, figures and Odds tables break between phrases in Japanese at ${width} px${as}`, async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page } = await phone(browser, width);
    await page.goto('/games/sugoroku');
    await arrived(page);
    const machine = page.getByTestId('sg-machine');
    await expect(machine).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    const status = page.getByTestId('sg-status');
    const said = await brokenIn(status, SG_WORDS);
    // A 6 from START, its LAMP CHANCE stopping on ×5: the line that says how the roll ended.
    await rigPresses(page, [numberForFace(6), 0.1, 0.1, 0.1, numberForLamp(3), 0.1]);
    await pressUntil(page.getByTestId('sg-roll'), async () => ((await machine.getAttribute('data-round')) ?? '') !== '');
    // Pressed until the show has ended: ROLL lifts the view to the board with a smooth scroll (lookUp.ts), and a Skip
    // pressed as the page starts to glide came down on Skip and up on what had moved under it, which is no click
    // (Firefox, once in a full run).
    await pressUntil(page.getByTestId('sg-skip'), async () => (await machine.getAttribute('data-phase')) === 'idle');
    await expect(machine).toHaveAttribute('data-phase', 'idle');
    await expect(status).toContainText('ランプチャンス');
    if (safari) await asSafariBreaks(page);
    expect(await sideways(page), `the machine at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(status, SG_WORDS)));
    said.push(...(await brokenIn(page.locator('#sg-session-title ~ dl dt'), SG_WORDS)));
    // The legend that names the squares.
    said.push(...(await brokenIn(page.getByTestId('sg-legend').locator('li'), [...SG_WORDS, '数字', 'ひとやすみ', 'ふりだし', 'ボーナス', 'ファイナル'])));
    await page.locator('#sg-tab-odds').click();
    const odds = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(odds.getByTestId('sg-squares-table')).toBeVisible();
    if (safari) await asSafariBreaks(page);
    expect(await sideways(page), `the Odds tab at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(odds.locator('table th, table td, [class*="statLabel"], [class*="statNote"]'), SG_WORDS)));
    expect(said, `at ${width} px${as}`).toEqual([]);
    await context.close();
  });
}

// ── Candy Shop Medal Maze ───────────────────────────────────────────────────

const CM_WORDS = ['メダル', 'ゲート', '開いたら', 'はじこう', 'アウト', '閉まって', '持ちメダル', '当たり', '大当たり', 'タイミング', 'ぴったり', 'ふつう', '腕前', '目をつぶって', '戻り', '割合', '回数', '差し引き', '抜けた', 'スキップ', '確率', '設定', 'ポケット', 'もらえる'];

for (const width of WIDTHS) for (const safari of [false, true]) {
  const as = safari ? ', broken as Safari and Firefox break them' : '';
  test(`the Candy Shop Medal Maze's status line, figures and Odds tables break between phrases in Japanese at ${width} px${as}`, async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page } = await phone(browser, width);
    await page.goto('/games/coin-maze');
    await arrived(page);
    const machine = page.getByTestId('cm-machine');
    await expect(machine).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    if (safari) await asSafariBreaks(page);
    const status = page.getByTestId('cm-status');
    const said = await brokenIn(status, CM_WORDS);
    // A medal at the first gate (the line that asks for the flick), then flicked into it shut: the line that says so.
    await rigPresses(page, mazeNumbers({ gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [1, 1, 1, 1], pins: [true, true, false, false] }));
    await pressUntil(page.getByTestId('cm-drop'), async () => ((await machine.getAttribute('data-round')) ?? '') !== '');
    await expect(machine).toHaveAttribute('data-phase', 'wait', { timeout: 10_000 });
    said.push(...(await brokenIn(status, CM_WORDS)));
    // The lever, the moment the gate stands shut (the case says how it stands in the window a flick would meet).
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const box = document.querySelector('[data-testid="cm-board"]')!;
          const observer = new MutationObserver(() => {
            if (box.getAttribute('data-slot') !== 'shut') return;
            observer.disconnect();
            document.querySelector<HTMLButtonElement>('[data-testid="cm-lever"]')!.click();
            resolve();
          });
          observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
        }),
    );
    await expect(machine).toHaveAttribute('data-result', 'out-1', { timeout: 10_000 });
    await expect(status).toContainText('アウト');
    expect(await sideways(page), `the machine at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(status, CM_WORDS)));
    said.push(...(await brokenIn(page.locator('#cm-session-title ~ dl dt'), CM_WORDS)));
    await page.locator('#cm-tab-odds').click();
    const odds = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(odds.getByTestId('cm-gates-table')).toBeVisible();
    if (safari) await asSafariBreaks(page);
    expect(await sideways(page), `the Odds tab at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(odds.locator('table th, table td, [class*="statLabel"], [class*="statNote"]'), CM_WORDS)));
    expect(said, `at ${width} px${as}`).toEqual([]);
    await context.close();
  });
}

// ── Video Keno ──────────────────────────────────────────────────────────────

const KN_WORDS = ['数字', 'えらぶ', 'えらんで', 'えらんだ', 'クイックピック', 'ドロー', 'ベット', '当たり', '最後', '自分', 'もらえる', 'メダル', '持ちメダル', '戻り', '割合', '回数', '差し引き', 'いちばん', '確率', '抽選', 'スキップ', 'うちわけ'];

for (const width of WIDTHS) for (const safari of [false, true]) {
  const as = safari ? ', broken as Safari and Firefox break them' : '';
  test(`Video Keno's status line, paytable, figures and Odds tables break between phrases in Japanese at ${width} px${as}`, async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page } = await phone(browser, width);
    await page.goto('/games/keno');
    await arrived(page);
    const machine = page.getByTestId('kn-machine');
    await expect(machine).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    if (safari) await asSafariBreaks(page);
    const status = page.getByTestId('kn-status');
    const paytable = page.getByTestId('kn-paytable');
    const said = [...(await brokenIn(status, KN_WORDS)), ...(await brokenIn(paytable.locator('p'), KN_WORDS))];
    // A quick pick of five, then a draw that catches three of them, the last on the last ball: the longest result line.
    await rigPresses(page, kenoNumbers([3, 12, 33, 41, 70]));
    await pressUntil(page.getByTestId('kn-quick'), async () => (await page.getByTestId('kn-cell-3').getAttribute('aria-pressed')) === 'true');
    said.push(...(await brokenIn(status, KN_WORDS)));
    await rigPresses(page, kenoNumbers([3, 12, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 70]));
    await pressUntil(page.getByTestId('kn-draw'), async () => ((await machine.getAttribute('data-round')) ?? '') !== '');
    // Pressed until the draw has ended: DRAW lifts the view with a smooth scroll, which can take a Skip's click away (as
    // Sugoroku's ROLL, above).
    await pressUntil(page.getByTestId('kn-skip'), async () => (await machine.getAttribute('data-phase')) === 'done');
    await expect(machine).toHaveAttribute('data-phase', 'done', { timeout: 10_000 });
    await expect(status).toContainText('最後の球で×5');
    expect(await sideways(page), `the machine at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(status, KN_WORDS)));
    said.push(...(await brokenIn(paytable.locator('th, td, p, h2'), KN_WORDS)));
    said.push(...(await brokenIn(page.locator('#kn-session-title ~ dl dt'), KN_WORDS)));
    await page.locator('#kn-tab-odds').click();
    const odds = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(odds.getByTestId('kn-tickets-table')).toBeVisible();
    if (safari) await asSafariBreaks(page);
    expect(await sideways(page), `the Odds tab at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(odds.locator('table th, table td, [class*="statLabel"], [class*="statNote"], [class*="note"], [class*="intro"] p, li'), KN_WORDS)));
    expect(said, `at ${width} px${as}`).toEqual([]);
    await context.close();
  });
}

// ── Hot Spring Smart Ball ───────────────────────────────────────────────────

const SMB_WORDS = ['スタート', 'メダル', '引いて', '離して', '打とう', '入った', 'ビンゴ', '弱すぎて', '戻ってきた', 'もう一度', '持ちメダル', '当たり', '回数', '差し引き', '光った', '割合', 'いちばん', '上手な', '打ち方', '戻り', 'ふつう', '腕前', '目をつぶって', '強さ', 'そろった', '確率', '左はし', '左より', '右より', '右はし'];

for (const width of WIDTHS) for (const safari of [false, true]) {
  const as = safari ? ', broken as Safari and Firefox break them' : '';
  test(`Hot Spring Smart Ball's (smart-ball) status line, figures and Odds tables break between phrases in Japanese at ${width} px${as}`, async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page } = await phone(browser, width);
    await page.goto('/games/smart-ball');
    await arrived(page);
    const machine = page.getByTestId('smb-machine');
    await expect(machine).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    if (safari) await asSafariBreaks(page);
    const status = page.getByTestId('smb-status');
    const said = await brokenIn(status, SMB_WORDS);
    // A play whose first marble, shot at the middle strength, drops into hole 1: the line that asks for the pull, then the
    // one that says where it went and asks for the next.
    const drops = [smbSlot(3, { row: 0, col: 0 }), ...Array.from({ length: 9 }, () => smbSlot(3, null))];
    await rigPresses(page, smbNumbers({ drops, blinds: Array.from({ length: 10 }, () => 3) }));
    await pressUntil(page.getByTestId('smb-start'), async () => ((await machine.getAttribute('data-round')) ?? '') !== '');
    await expect(machine).toHaveAttribute('data-phase', 'aim', { timeout: 10_000 });
    said.push(...(await brokenIn(status, SMB_WORDS)));
    // The plunger held, and let go the moment the board says the middle strength.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const box = document.querySelector('[data-testid="smb-board"]')!;
          const plunger = document.querySelector('[data-testid="smb-plunger"]')!;
          const observer = new MutationObserver(() => {
            if (box.getAttribute('data-window') !== '3') return;
            observer.disconnect();
            plunger.dispatchEvent(new PointerEvent('pointerup', { pointerId: 21, isPrimary: true, button: 0, bubbles: true }));
            resolve();
          });
          observer.observe(box, { attributes: true, attributeFilter: ['data-window'] });
          plunger.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 21, isPrimary: true, button: 0, bubbles: true }));
        }),
    );
    await expect(machine).toHaveAttribute('data-marble', '1', { timeout: 10_000 });
    await expect(status).toContainText('入った');
    expect(await sideways(page), `the machine at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(status, SMB_WORDS)));
    said.push(...(await brokenIn(page.locator('#smb-session-title ~ dl dt'), SMB_WORDS)));
    await page.locator('#smb-tab-odds').click();
    const odds = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(odds.getByTestId('smb-windows-table')).toBeVisible();
    if (safari) await asSafariBreaks(page);
    expect(await sideways(page), `the Odds tab at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(odds.locator('table th, table td, [class*="statLabel"], [class*="statNote"]'), SMB_WORDS)));
    expect(said, `at ${width} px${as}`).toEqual([]);
    await context.close();
  });
}

const PK_WORDS = ['玉貸し', 'メダル', 'ハンドル', '発射', '発射中', 'ヘソ', '液晶', '持ちメダル', '持ち玉', '回転数', '大当たり', '戻り', '割合', 'いちばん', '上手な', '打ち方', 'ふつう', '腕前', '止め打ち', '右打ち', '左打ち', '電チュー', 'アタッカー', '強さ', '保留', '時短', 'ラウンド', '引き戻し', 'ちょうちん', 'ねらおう', 'そろえよう'];

for (const width of WIDTHS) for (const safari of [false, true]) {
  const as = safari ? ', broken as Safari and Firefox break them' : '';
  test(`Goldfish Lantern Pachinko's (pachinko) status line, figures and Odds tables break between phrases in Japanese at ${width} px${as}`, async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page } = await phone(browser, width);
    await page.goto('/games/pachinko');
    await arrived(page);
    const machine = page.getByTestId('pk-machine');
    await expect(machine).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    if (safari) await asSafariBreaks(page);
    const status = page.getByTestId('pk-status');
    const said = await brokenIn(status, PK_WORDS);
    // A lend whose first ball goes OUT: the line that asks for the handle, then the one said while it is held.
    await rigPresses(page, pkNumbers({ fate: 127, lot: 65_535, split: 99, show: 1_023, seed: 1 }));
    await pressUntil(page.getByTestId('pk-lend'), async () => (await machine.getAttribute('data-tray')) !== '0');
    await expect(status).toContainText('ヘソ');
    said.push(...(await brokenIn(status, PK_WORDS)));
    await page.evaluate(() => document.querySelector('[data-testid="pk-handle"]')!.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 24, isPrimary: true, button: 0, bubbles: true })));
    await expect(status).toContainText('発射中');
    said.push(...(await brokenIn(status, PK_WORDS)));
    await page.evaluate(() => document.querySelector('[data-testid="pk-handle"]')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: 24, isPrimary: true, button: 0, bubbles: true })));
    expect(await sideways(page), `the machine at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(page.locator('#pk-session-title ~ dl dt'), PK_WORDS)));
    await page.locator('#pk-tab-odds').click();
    const odds = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(odds.getByTestId('pk-strengths-table')).toBeVisible();
    if (safari) await asSafariBreaks(page);
    expect(await sideways(page), `the Odds tab at ${width} px${as}`).toBe(0);
    said.push(...(await brokenIn(odds.locator('table th, table td, [class*="statLabel"], [class*="statNote"], dl dt'), PK_WORDS)));
    expect(said, `at ${width} px${as}`).toEqual([]);
    await context.close();
  });
}

// ── The medal center's plates ───────────────────────────────────────────────

test.describe('the medal center’s plates, laid out as Safari and Firefox break them', () => {
  // Each cabinet's line on its plate (floorPlan.ts MACHINE_PITCHES) was on auto-phrase alone: Chromium broke it between
  // phrases, Safari and Firefox anywhere in its kana (「1/99.9の甘デジ。メ｜ダルで玉を借りて遊｜ぶ」 at 320 px). Laid out
  // here as they lay it out, it breaks only between the phrases the plate marks (a zero-width space) and at its 、 and
  // 。, and no line of it is cut off by the plate or runs out of it.
  for (const width of WIDTHS) {
    test(`every cabinet's line on its plate breaks only between its phrases, and shows whole, in Japanese at ${width} px`, async ({ browser }) => {
      const { context, page } = await phone(browser, width);
      await page.goto('/games/medal-center');
      await arrived(page);
      await asSafariBreaks(page);
      const plates = page.locator('[data-testid^="center-pitch-"]');
      await expect(plates).toHaveCount(FLOOR_GAMES.length);
      for (const plate of await plates.all()) {
        const id = (await plate.getAttribute('data-testid'))!.replace('center-pitch-', '');
        // Where the line may break, as an offset into its words as they are read: at each zero-width space, and after a 、
        // or 。. The marks themselves (a zero-width space, a word joiner) take no room and are not read.
        const { text, ends, whole } = await plate.evaluate((el) => {
          const marks: number[] = [];
          let words = '';
          for (const character of el.textContent ?? '') {
            if (character === '\u200B') marks.push(words.length);
            else if (character !== '\u2060') {
              words += character;
              if ('、。'.includes(character)) marks.push(words.length);
            }
          }
          return { text: words, ends: marks, whole: el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1 };
        });
        const lines = await linesOf(plate);
        expect(lines.join(''), id).toBe(text);
        let done = 0;
        for (const line of lines.slice(0, -1)) {
          done += line.length;
          expect(ends.includes(done), `${id} at ${width} px: 「${lines.join('｜')}」`).toBe(true);
        }
        expect(whole, `${id} at ${width} px: 「${lines.join('｜')}」 cut off or spilling out of its plate`).toBe(true);
      }
      expect(await sideways(page), `the medal center at ${width} px`).toBe(0);
      await context.close();
    });
  }
});
