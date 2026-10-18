/**
 * The floor plan: which corner of the medal floor each machine stands in, and
 * the one line on its plate that says what it is, in English and Japanese.
 *
 * A real Japanese medal floor (a Round One, a Taito Station) is laid out in
 * corners, each under a sign that hangs from the ceiling: the new machines by
 * the door (新台), the pushers and the other big machines in the middle, the
 * rows of video and slot machines with the kids' and candy shop corner
 * (駄菓子屋) beside them, and the casino tables at the back. The medal center's
 * front is laid out the same way (MachineFloor.tsx).
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
 * side by side where they fit, so this order also pairs them: the pusher with the big machines, the video machines with
 * the candy shop, and the tables across the back.
 */
export const ZONES = ['new', 'pusher', 'big', 'video', 'kids', 'table'] as const;
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
};

/**
 * Machines marked NEW wherever they stand. A machine with no corner yet is
 * marked NEW without being listed here.
 */
export const NEW_MACHINES: ReadonlySet<string> = new Set<string>(['fishing', 'horse-race']);

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
 * A machine's best return in percent, to one decimal, as the floor's rules
 * (src/lib/medalFloor/games.ts) publish it, or null for a machine not in them
 * yet. Each rule is its machine's exact odds rounded to four places, sometimes
 * up, so a last digit of 5 is rounded down here: the plate never says a
 * machine brings back more than it does (9/6 video poker's 99.544% is 99.5%).
 */
export function bestReturnPercent(id: string): number | null {
  if (!isFloorGame(id)) return null;
  return Math.round(FLOOR_RULES[id].bestReturn * 1_000 - 1e-6) / 10;
}
