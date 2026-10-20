import { test, expect, type Page } from './fixtures';

import { FLOOR_GAMES } from '../../src/lib/medalFloor/games';
import { holdFloor } from './layoutShift';
import { arrived } from './streamedPage';

// In Japanese, the medal floor speaks Japanese: no English word is left on a machine's page as a player on a phone
// first sees it, nor on the medal center's front, My Page or the rankings. The only English allowed is what a real
// Japanese game center prints in English on purpose, listed below with the reason. The floor's API is faked; nothing
// reaches a real server.

/**
 * English a Japanese game center shows on purpose: the marquee names and signs of the cabinets and corners, the lamps
 * and pockets on a machine's playfield, the felt of a casino table, and the main button of a cabinet, printed in
 * English on the real thing. Each is a whole word or phrase, matched case-sensitively.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  // Marquees and signs: a cabinet's or a corner's name, shown beside its Japanese name.
  'MEDAL GAME CENTER': 'the center’s sign, over 「メダルゲームセンター」',
  'MY PAGE': 'My Page’s sign, over 「マイページ」',
  'PUSHER CORNER': 'a corner’s sign, beside its Japanese name',
  'VIDEO & SLOTS': 'a corner’s sign, beside its Japanese name',
  'BIG MACHINES': 'a corner’s sign, beside its Japanese name',
  'KIDS & CANDY SHOP': 'a corner’s sign, beside its Japanese name',
  'TABLE GAMES': 'a corner’s sign, beside its Japanese name',
  'GOLDEN FEVER': 'the pusher’s marquee, over 「ゴールデンフィーバー」',
  'LUCKY 7': 'the slot machine’s marquee',
  'CALICO JANKEN': 'Calico Janken’s marquee, under 「みけじゃんけん」',
  'BIG CATCH HARBOR': 'the fishing machine’s marquee, over 「大漁ハーバー」',
  'BALL BINGO': 'Ball Bingo’s marquee, over 「ボールビンゴ」',
  'BIG WHEEL': 'the Big Wheel’s marquee, under 「星まつり」',
  'HIGH & LOW': 'the High & Low Ladder’s marquee, over 「ラダー」',
  'SIC BO': 'the Sic Bo table’s marquee, under 「月夜の大小」',
  'WHALE ISLE': 'Whale Isle Sugoroku’s marquee, over 「すごろく」',
  'MEDAL MAZE': 'the candy shop maze’s hand-painted sign, over 「だがしや」',
  'VIDEO KENO': 'the video keno cabinet’s marquee, over 「ビデオキノ」',
  'SMART BALL': 'the smart ball table’s noren, over 「湯けむり」',
  'GOLDFISH LANTERN': 'the pachinko cabinet’s marquee, beside 「パチンコ・1/99.9」',
  // Lamps, pockets and reel symbols on a playfield, as real medal machines print them.
  JACKPOT: 'the pusher’s jackpot lamp',
  START: 'the pusher’s START pockets and the START buttons of the cabinets',
  BAR: 'a reel symbol',
  BONUS: 'the Big Wheel’s bonus segments',
  FREE: 'Ball Bingo’s FREE pockets',
  CHANCE: 'Ball Bingo’s CHANCE pocket',
  OUT: 'Ball Bingo’s OUT pockets, the OUT holes of the candy shop maze, and the smart ball’s OUT gutter',
  GF: 'the pusher’s model number, 「型式 GF-777」',
  // A cabinet's main button, printed in English on the real thing.
  SPIN: 'the roulette and slot machines’ main button',
  ROLL: 'the craps table’s main button',
  // The craps felt, printed in English as on a real table, with the Japanese under each name.
  'PASS LINE': 'the craps felt',
  "DON'T PASS BAR": 'the craps felt',
  "DON'T COME BAR": 'the craps felt',
  COME: 'the craps felt',
  FIELD: 'the craps felt',
  SIX: 'the craps felt',
  NINE: 'the craps felt',
  SEVEN: 'the craps felt',
  'ANY CRAPS': 'the craps felt',
  TO: 'the craps felt’s odds, 「4 TO 1」',
  OFF: 'the craps puck',
  ON: 'the craps puck',
  // Words and abbreviations a Japanese player reads as they are.
  OK: 'the button that puts a note away: everyday Japanese',
  MAX: 'MAXベット, as a pachislot’s MAX BET button says it',
  JP: 'JP対象 and the pusher’s JP lamp: a Japanese medal hall’s word for its jackpot',
  RTP: 'the slot machine’s return, 「還元率（RTP）」',
  EZ: 'the baccarat table’s name, 「ノーコミッション（EZ）」',
  ST: 'a pachinko’s ST (スペシャルタイム), as Japanese machines print it: 「ST残り30回」',
};

const PAGES = [...FLOOR_GAMES.map((game) => `/games/${game}`), '/games/medal-center', '/games/medal-center/records', '/games/medal-center/rankings'];

/** The English words and phrases in the page's main content that a player can see, each with where it is. */
async function englishShown(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const found: string[] = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const text = node.data.replace(/\s+/g, ' ').trim();
      if (!/[A-Za-z]{2,}/.test(text)) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, [hidden], [aria-hidden="true"][data-sr-only]')) continue;
      if (!parent.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some((r) => r.width > 0 && r.height > 0)) continue;
      found.push(text);
    }
    return found;
  });
}

/** What is left of a text once the allowed English is taken out: the words that are not allowed. */
function strayWords(text: string): string[] {
  let rest = text;
  // Longest first, so that a phrase is taken before a word inside it.
  for (const allowed of Object.keys(ALLOWED).sort((a, b) => b.length - a.length)) {
    const escaped = allowed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rest = rest.replace(new RegExp(`(^|[^A-Za-z'])${escaped}(?![A-Za-z])`, 'g'), '$1');
  }
  return rest.match(/[A-Za-z][A-Za-z'’]+/g) ?? [];
}

for (const path of PAGES) {
  test(`${path} in Japanese on a phone shows no stray English`, async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
    const page = await context.newPage();
    const floor = await holdFloor(page);
    floor.release();
    expect((await page.goto(path))?.status()).toBe(200);
    await arrived(page);
    await expect(page.locator('[data-loaded="false"]')).toHaveCount(0, { timeout: 20_000 });
    const stray = (await englishShown(page)).flatMap((text) => strayWords(text).map((word) => `${word}  ←  「${text.slice(0, 60)}」`));
    expect(stray, `${path}: English left in the Japanese page`).toEqual([]);
    await context.close();
  });
}
