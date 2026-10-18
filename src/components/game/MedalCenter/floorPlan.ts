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
};

/**
 * Machines marked NEW wherever they stand. A machine with no corner yet is
 * marked NEW without being listed here.
 */
export const NEW_MACHINES: ReadonlySet<string> = new Set<string>(['fishing', 'horse-race', 'ball-bingo', 'big-wheel']);

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
 */
export const PLATE_RETURNS: Readonly<Record<string, { least?: number; most: number }>> = {
  craps: { most: 1_097 / 1_100 },
  'horse-race': { least: 0.895, most: 0.9 },
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
