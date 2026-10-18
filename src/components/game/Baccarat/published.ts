/**
 * Baccarat's exact odds off the top of a fresh shoe, as the table publishes them: what `exactOdds` (analysis.ts)
 * counts over every ordered six-card draw of a shoe of 1, 2, 4, 6 and 8 decks, written out here once.
 *
 * The page shows these, so that opening it never counts them again: the five counts take about 70 ms on a desktop
 * and some 280 ms on a phone as the page wakes up, and they always come to the same numbers (every one a whole number
 * of draws). `tests/unit/components/game/Baccarat/published.test.tsx` counts them afresh and checks that every figure
 * here is exactly what the count gives; a change to the drawing rules fails it until this is written out again (the
 * test prints what to write). A shoe with cards gone from it is still counted as the hand is dealt.
 */

import { exactOdds, type ExactOdds } from './analysis';

/** The odds off the top of a fresh shoe of each deck count the Odds tab offers (`shoeOdds`). */
export const PUBLISHED_SHOES: Readonly<Record<number, ExactOdds>> = {
  1: {
    cards: 52,
    total: 14658134400,
    banker: 6737232640,
    player: 6548674432,
    tie: 1372227328,
    dragon7: 330417504,
    panda8: 503949952,
    natural: 5048422656,
    playerDraws: 7354758528,
    bankerDraws: 6343291456,
    cardsUsed: [5570551296, 4477116224, 4610466880],
    pair: 156,
    pairTotal: 2652,
  },
  2: {
    cards: 104,
    total: 1092514737600,
    banker: 501543728128,
    player: 487816735232,
    tie: 103154274240,
    dragon7: 24627590528,
    panda8: 37663599616,
    natural: 375439996800,
    playerDraws: 549195768000,
    bankerDraws: 474436721088,
    cardsUsed: [414471340800, 332454304512, 345589092288],
    pair: 728,
    pairTotal: 10712,
  },
  4: {
    cards: 208,
    total: 75297571090560,
    banker: 34543624867840,
    player: 33608344225792,
    tie: 7145601996928,
    dragon7: 1697007097344,
    panda8: 2599300440064,
    natural: 25845956726016,
    playerDraws: 37887515455104,
    bankerDraws: 32756173308544,
    cardsUsed: [28540630927872, 22870191561728, 23886748600960],
    pair: 3120,
    pairTotal: 43056,
  },
  6: {
    cards: 312,
    total: 878869206895680,
    banker: 403095751234560,
    player: 392220492728832,
    tie: 83552962932288,
    dragon7: 19805383926144,
    panda8: 30352294536192,
    natural: 301554615390336,
    playerDraws: 442363412006208,
    bankerDraws: 382552103624256,
    cardsUsed: [333025560274176, 266771777612544, 279071869008960],
    pair: 7176,
    pairTotal: 97032,
  },
  8: {
    cards: 416,
    total: 4998398275503360,
    banker: 2292252566437888,
    player: 2230518282592256,
    tie: 475627426473216,
    dragon7: 112633011329024,
    panda8: 172660763262976,
    natural: 1714696016515584,
    playerDraws: 2516262520193280,
    bankerDraws: 2176327999115520,
    cardsUsed: [1893735611458560, 1516734808780800, 1587927855264000],
    pair: 12896,
    pairTotal: 172640,
  },
};

/** The published odds off the top of a fresh shoe of `decks` decks; a deck count not written out here is a mistake. */
export function publishedShoeOdds(decks: number): ExactOdds {
  const odds = PUBLISHED_SHOES[decks];
  if (!odds) throw new Error(`the odds of a ${decks}-deck shoe are not written out in published.ts`);
  return odds;
}

/**
 * The exact odds of the next hand from the cards nobody has seen: the published odds when that is a whole fresh
 * shoe (as it is when the page opens), and counted afresh otherwise.
 */
export function unseenOdds(rankCounts: readonly number[]): ExactOdds {
  const perRank = rankCounts[0];
  const fresh = perRank > 0 && perRank % 4 === 0 && rankCounts.every((count) => count === perRank) && PUBLISHED_SHOES[perRank / 4];
  return fresh ? PUBLISHED_SHOES[perRank / 4] : exactOdds(rankCounts);
}
