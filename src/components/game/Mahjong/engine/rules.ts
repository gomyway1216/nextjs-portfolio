/**
 * Riichi Mahjong — v1 rule set.
 *
 * This is the frozen specification for the first release. Engine modules must
 * read behaviour from a {@link Rules} object rather than hard-coding it, so a
 * variant only needs a different constant here.
 */

import type { Rules } from './types';

/**
 * Default v1 rules: tonpuusen, 25000 start / 30000 return, three red fives,
 * ari-ari (open tanyao and late yaku allowed), ippatsu and ura dora on,
 * kan dora and kan ura on, double ron pays both, kyuushu kyuuhai is the only
 * abortive draw, tobi ends the game.
 *
 * Deliberately NOT in v1: suufon renda, suucha riichi, suukaikan, nagashi
 * mangan, kiriage mangan, renhou, pao (sekinin barai).
 */
export const DEFAULT_RULES: Rules = {
  length: 'tonpuu',
  startingScore: 25000,
  returnScore: 30000,
  redFives: true,
  ippatsu: true,
  uraDora: true,
  kanDora: true,
  kanUraDora: true,
  kuitan: true,
  doubleRon: true,
  kyuushuKyuuhai: true,
  tobi: true,
  doubleYakuman: false,
  kazoeYakuman: true,
  honbaValue: 300,
  riichiStickValue: 1000,
  noTenPenalty: 3000,
};

/** Hanchan variant, used by the UI when the player selects a full game. */
export const HANCHAN_RULES: Rules = {
  ...DEFAULT_RULES,
  length: 'hanchan',
};

/** Points put on the table to declare riichi. */
export const RIICHI_COST = 1000;

/** Number of hands before the game may end (East 1..4, plus South 1..4). */
export function baseHandCount(rules: Rules): number {
  return rules.length === 'tonpuu' ? 4 : 8;
}

/** Maximum number of kans in a hand before suukaikan would apply. */
export const MAX_KAN_COUNT = 4;

/** Dealer wins and dealer tenpai at an exhaustive draw continue the deal. */
export const DEALER_REPEAT_ON_TENPAI = true;
