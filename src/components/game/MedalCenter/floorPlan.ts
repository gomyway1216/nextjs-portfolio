/**
 * The floor plan: which corner of the medal floor each machine stands in, and
 * the one line on its plate that says what it is, in English and Japanese.
 *
 * A real Japanese medal floor (a Round One, a Taito Station) is laid out in
 * corners, each under a sign that hangs from the ceiling: the new machines by
 * the door (新台), the pushers with the rows of video and slot machines beside
 * them, the other big machines in the middle, the kids' and candy shop corner
 * (駄菓子屋), and the casino tables at the back. The medal center's front is
 * laid out the same way (MachineFloor.tsx).
 *
 * The machines themselves are listed in `FLOOR` (MedalCenter.tsx). A machine
 * that comes onto the floor with no line here still shows: it stands with the
 * new machines, marked NEW, its catalog description on its plate, until a line
 * here gives it a corner and a pitch of its own.
 *
 * Nothing here is money, and no word of it may read as money.
 */

import { FLOOR_RULES, isFloorGame } from '@/lib/medalFloor/games';
import type { GameLanguage } from '../constants/gameTranslations';

/**
 * The corners of the floor, in the order a player walks onto them from the door. On a wide screen the corners stand
 * side by side where they fit, so this order also pairs them: the pusher beside the video machines, then the big
 * machines across the floor (two big cabinets fill a row), the candy shop, and the tables across the back.
 */
export const ZONES = ['new', 'pusher', 'video', 'big', 'kids', 'table'] as const;
export type ZoneId = (typeof ZONES)[number];

type Words = Record<GameLanguage, string>;

/** Each corner's hanging sign. */
export const ZONE_SIGNS: Readonly<Record<ZoneId, Words>> = {
  new: { en: 'NEW MACHINES', ja: '新台入荷' },
  pusher: { en: 'PUSHER CORNER', ja: 'プッシャーコーナー' },
  big: { en: 'BIG MACHINES', ja: '大型機コーナー' },
  video: { en: 'VIDEO & SLOTS', ja: 'ビデオ・スロット' },
  table: { en: 'TABLE GAMES', ja: 'テーブルゲーム' },
  kids: { en: 'KIDS & CANDY SHOP', ja: 'キッズ・駄菓子屋' },
};

/**
 * The corners whose machines are big cabinets, each one as wide as two of the
 * others: the pushers, and the big machines a floor is built around (a horse
 * race, a ball-drop bingo).
 */
export const WIDE_ZONES: ReadonlySet<ZoneId> = new Set<ZoneId>(['pusher', 'big']);

/** Where each machine stands. One line a machine. */
export const MACHINE_ZONES: Readonly<Record<string, Exclude<ZoneId, 'new'>>> = {
  'medal-pusher': 'pusher',
  'slot-machine': 'video',
  'video-poker': 'video',
  roulette: 'table',
  blackjack: 'table',
  baccarat: 'table',
  craps: 'table',
  'three-card-poker': 'table',
  janken: 'kids',
  // A fishing medal machine stands with the family machines, as Fishing Spirits (釣りスピリッツ) does on a real floor.
  fishing: 'kids',
  'horse-race': 'big',
  'ball-bingo': 'big',
  // An upright prize wheel stands among the big machines a floor is built round, as the casino's Big Six stands on its floor.
  'big-wheel': 'big',
  // A card machine stands with the video machines: a screen of cards and a row of buttons, as a medal poker cabinet does.
  'high-low': 'video',
  // An electronic Sic Bo table stands with the casino tables at the back, as on a casino's floor.
  'sic-bo': 'table',
  // A board-game machine stands among the big machines, as the board-game medal machines of a real floor are big
  // cabinets in the middle of it.
  sugoroku: 'big',
  // A flick-a-medal maze stands in the candy shop corner, as the 10-yen flick games stood outside a candy shop.
  'coin-maze': 'kids',
  // A video keno cabinet stands with the video machines: a screen of numbers and a row of lit buttons, as on a casino's
  // floor, where video keno stands among the video poker and slot machines.
  keno: 'video',
  // A smart ball table stands in the candy shop corner, as the smart ball of the hot-spring towns' game rooms stood with
  // the shooting gallery and the candy counter.
  'smart-ball': 'kids',
  // A medal pachinko stands in the video & slots corner, as a game center's pachinko and pachislot corner stands its
  // pachinko beside the pachislot.
  pachinko: 'video',
};

/**
 * Machines marked NEW wherever they stand. A machine with no corner yet is
 * marked NEW without being listed here.
 */
export const NEW_MACHINES: ReadonlySet<string> = new Set<string>(['fishing', 'horse-race', 'ball-bingo', 'big-wheel', 'high-low', 'sic-bo', 'sugoroku', 'coin-maze', 'keno', 'smart-ball', 'pachinko']);

/** What each machine is, in a line, on its plate. One line a machine. */
export const MACHINE_PITCHES: Readonly<Record<string, Words>> = {
  'medal-pusher': { en: 'Push medals over the edge; chase the jackpot.', ja: 'メダルを押し出してジャックポットを狙え。' },
  'slot-machine': { en: 'Three reels; 7-7-7 pays 1,000 a medal.', ja: '3リール。777なら1枚につき1,000枚。' },
  janken: { en: 'Beat the calico cat; the lamps pick your win.', ja: '三毛ねことじゃんけん。ランプが当たりを決める。' },
  roulette: { en: 'Single zero, and why the Martingale fails.', ja: 'シングルゼロ。マーチンゲール法の落とし穴も。' },
  blackjack: { en: 'Six decks, the basic-strategy chart at hand.', ja: '6デッキ。ベーシックストラテジー表つき。' },
  'video-poker': { en: 'Jacks or Better 9/6, with a double-up.', ja: '9/6ジャックス・オア・ベターとダブルアップ。' },
  baccarat: { en: 'Eight-deck Punto Banco, with the scoreboards.', ja: '8デッキのプント・バンコ。罫線つき。' },
  craps: { en: 'Roll the dice; the odds bet pays true odds.', ja: 'サイコロを振ろう。オッズベットは確率どおり。' },
  'three-card-poker': { en: 'Ante, see three cards, then play or fold.', ja: 'アンティを置き、3枚を見て勝負か降りるか。' },
  fishing: { en: 'Cast for 1, 3 or 5 and reel in the harbor lord.', ja: '1・3・5枚でキャスト。港のヌシを釣り上げろ。' },
  'horse-race': { en: 'Six horses on a mini track: win or quinella.', ja: 'ミニコースを6頭が走る。単勝か連複を買おう。' },
  'ball-bingo': { en: 'Drop balls through the pins; line up a 3×3 card.', ja: '釘を抜けるボールで3×3のビンゴをそろえよう。' },
  'big-wheel': { en: 'A 54-segment wheel; its bonus reaches ×400.', ja: '54マスの大車輪。ボーナスで最大×400' },
  'high-low': { en: 'Higher or lower? Climb 12 rungs, or TAKE.', ja: '次はハイかローか。12段のラダーを上ろう' },
  'sic-bo': { en: 'Three dice in a glass dome; a triple pays 180:1.', ja: 'ドームで振る3つのサイコロ。ゾロ目は180:1' },
  sugoroku: { en: 'Roll the die, sail the isle, ride the whale.', ja: 'サイコロで島をめぐり、くじらに乗ろう' },
  'coin-maze': { en: 'Flick one medal through four gates to WIN.', ja: 'レバーではじいて4つのゲートを抜けよう' },
  keno: { en: 'Mark 1 to 10 of 80; a last-ball catch pays ×5.', ja: '80の数字から1〜10個。最後の球なら×5' },
  'smart-ball': { en: 'Pull the plunger; light four holes in a row.', ja: 'バネで玉を打ち、穴を4つそろえてビンゴ' },
  pachinko: { en: 'A 1-in-99.9 pachinko; balls lent for medals.', ja: '1/99.9の甘デジ。メダルで玉を借りて遊ぶ' },
};

/**
 * Where a long Japanese name may break on a cabinet's sign: between its words. The sign keeps a phrase whole where the
 * browser can tell phrases apart, and a name too long for a line used to break wherever it ran out of room
 * (「スリーカードポー｜カー」 at 320 px).
 */
export const NAME_WORDS: Readonly<Record<string, readonly string[]>> = {
  'medal-pusher': ['メダル', 'プッシャー'],
  'slot-machine': ['スロット', 'マシン'],
  'video-poker': ['ビデオ', 'ポーカー'],
  'three-card-poker': ['スリーカード', 'ポーカー'],
  'horse-race': ['ミニターフ', '競馬'],
  'big-wheel': ['星まつり', 'ビッグホイール'],
  'high-low': ['ハイ＆ロー', 'ラダー'],
  'sic-bo': ['月夜の', 'シックボー'],
  sugoroku: ['くじら島', 'すごろく'],
  'coin-maze': ['駄菓子屋', 'メダル', 'めいろ'],
  keno: ['ビデオ', 'キノ'],
  'smart-ball': ['湯けむり', 'スマートボール'],
  pachinko: ['金魚ちょうちん', 'パチンコ'],
};

/** A cabinet's name in its words, where `NAME_WORDS` knows them and the name is still the one they make up. */
export const nameWords = (id: string, name: string): readonly string[] => {
  const words = Object.prototype.hasOwnProperty.call(NAME_WORDS, id) ? NAME_WORDS[id] : null;
  return words && words.join('') === name ? words : [name];
};

/** The corner a machine stands in: its own, or the new machines' when it has none yet. */
export const zoneOf = (id: string): ZoneId => (Object.prototype.hasOwnProperty.call(MACHINE_ZONES, id) ? MACHINE_ZONES[id] : 'new');

/** Whether a machine is marked NEW. */
export const isNewMachine = (id: string): boolean => zoneOf(id) === 'new' || NEW_MACHINES.has(id);

/** A machine's line, in the page's language, or null when it has none of its own yet. */
export const pitchOf = (id: string, language: GameLanguage): string | null => (Object.prototype.hasOwnProperty.call(MACHINE_PITCHES, id) ? MACHINE_PITCHES[id][language] : null);

/** A corner of the floor and the machines in it, in the floor's order. */
export interface FloorCorner<T extends { id: string }> {
  zone: ZoneId;
  machines: T[];
  /** How many of the floor's columns its machines fill side by side: a big cabinet takes two. */
  width: number;
}

/** The floor's machines by corner, in the order of `ZONES`, each corner's machines in the floor's order; corners with none are left out. */
export function cornersOf<T extends { id: string }>(machines: readonly T[]): FloorCorner<T>[] {
  return ZONES.flatMap((zone) => {
    const here = machines.filter((machine) => zoneOf(machine.id) === zone);
    return here.length === 0 ? [] : [{ zone, machines: here, width: here.length * (WIDE_ZONES.has(zone) ? 2 : 1) }];
  });
}

/** The most columns the floor has side by side, on its widest layout. */
export const PLAN_COLUMNS = 4;

/** How a corner stands on the floor's widest layout (`spansOf`). */
export interface CornerSpan {
  /** How many of the floor's columns it takes. */
  span: number;
  /** Whether it was squeezed into the columns left beside the corner before it, its cabinets on more rows. */
  squeezed: boolean;
  /**
   * Whether it shares its row with a squeezed corner on more rows than its own: its cabinets stand as tall as that
   * corner, so the two end level (a medal pusher beside the video machines, as tall as a real one is beside them).
   */
  tall: boolean;
}

/** The most rows a squeezed corner's cabinets stand on, beside the corner before it: five video machines beside the pusher are three. */
export const SQUEEZED_ROWS = 3;

/** How many rows of cabinets a corner fills in `span` columns: a big cabinet takes two of them. */
const rowsOf = (zone: ZoneId, width: number, span: number): number => {
  const perRow = WIDE_ZONES.has(zone) ? Math.max(1, Math.floor(span / 2)) * 2 : span;
  return Math.ceil(width / perRow);
};

/**
 * How many of the floor's columns each corner takes on its widest layout, the corners laid in order as a row fills:
 * as many as its machines need, up to a whole row. A corner of small cabinets too wide for the columns left beside the
 * corner before it, but that fits in up to `SQUEEZED_ROWS` rows of them, takes those columns (`squeezed`), its cabinets
 * on two or three rows, so that the pair still stands side by side (the video machines and the pachinko beside the
 * pusher) rather than half a row being left empty. The corner beside it, on fewer rows, stands as tall (`tall`).
 */
export function spansOf(corners: readonly { zone: ZoneId; width: number }[]): CornerSpan[] {
  let used = 0;
  let rowStart = 0;
  const laid: CornerSpan[] = [];
  corners.forEach(({ zone, width }, index) => {
    let span = Math.min(width, PLAN_COLUMNS);
    let squeezed = false;
    const rest = PLAN_COLUMNS - used;
    if (used > 0 && span > rest) {
      if (!WIDE_ZONES.has(zone) && width <= SQUEEZED_ROWS * rest) {
        span = rest;
        squeezed = true;
      } else {
        used = 0;
        rowStart = index;
      }
    }
    laid.push({ span, squeezed, tall: false });
    if (squeezed) {
      const rows = rowsOf(zone, width, span);
      for (let before = rowStart; before < index; before++) {
        if (rowsOf(corners[before].zone, corners[before].width, laid[before].span) < rows) laid[before].tall = true;
      }
    }
    used += span;
    if (used >= PLAN_COLUMNS) {
      used = 0;
      rowStart = index + 1;
    }
  });
  return laid;
}

/**
 * Where the floor's rule for a machine (`bestReturn` in src/lib/medalFloor/games.ts) is not a figure a player can get
 * by playing, the return its plate shows instead, as a fraction of the medals played, from the machine's own exact
 * odds (each pinned by a test against them). The rule is the best of any one bet, rounded up: right for deciding which
 * machines the floor jackpot is linked to, which must never be told less than a machine can bring back, but not what a
 * plate should promise.
 *
 * - **craps:** the odds behind a line bet pay true odds and bring back every medal, but cannot be made alone. The best
 *   a player can do is Don't Pass laying the full 6× odds behind it: 1,097 of every 1,100 medals wagered (99.73%; the
 *   Pass Line with 3-4-5× odds brings back 99.63%).
 * - **horse-race:** every ticket on a race brings back that race's return, which each race card sets between 89.5% and
 *   90%. No ticket is better than another, so the plate gives the range.
 * - **sugoroku:** the rule is the best square's next roll (93.06%), but the boat cannot stay on it: every roll moves it
 *   on. The best a player can do is bet 10 on every square but the six before START and 2 on those, which brings back
 *   92.30% in the long run (the board's Markov chain, worked out exactly in Sugoroku/engine.ts), and the plate says so.
 *   Written a hair under the exact figure, so the plate never says more.
 */
export const PLATE_RETURNS: Readonly<Record<string, { least?: number; most: number }>> = {
  craps: { most: 1_097 / 1_100 },
  'horse-race': { least: 0.895, most: 0.9 },
  sugoroku: { most: 0.923_014 },
};

/** A machine's return on its plate, in percent to one decimal: its best, or the range every play of it brings back. */
export interface PlateReturn {
  /** The least, where every play brings back a figure in a range; null where the plate gives the best. */
  least: number | null;
  most: number;
}

/**
 * A fraction as a percent to one decimal. The floor's rules round each machine's exact odds to four places, sometimes
 * up, so a last digit of 5 is rounded down here: the plate never says a machine brings back more than it does (9/6
 * video poker's 99.544% is 99.5%).
 */
const percent = (fraction: number): number => Math.round(fraction * 1_000 - 1e-6) / 10;

/**
 * A machine's return as its plate shows it: the playable figure where the floor's rule is only a bound
 * (`PLATE_RETURNS`), else its rule's best return; null for a machine not in the floor's rules yet.
 */
export function plateReturn(id: string): PlateReturn | null {
  const shown = Object.prototype.hasOwnProperty.call(PLATE_RETURNS, id) ? PLATE_RETURNS[id] : undefined;
  if (shown) return { least: shown.least === undefined ? null : percent(shown.least), most: percent(shown.most) };
  if (!isFloorGame(id)) return null;
  return { least: null, most: percent(FLOOR_RULES[id].bestReturn) };
}
