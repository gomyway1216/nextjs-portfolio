/**
 * Blackjack's exact figures as the table publishes them: what `analysis.ts` works out for every up card and every
 * two-card start, with perfect play under the table's rules and under each rule the Odds tab compares, for two fixed
 * ways of playing, and at every medal bet (where a blackjack's 3:2 is rounded down to whole medals), written out here
 * once.
 *
 * The page shows these, so that opening it never works them out again: the seventeen games of blackjack it would
 * reckon take about 20 ms on a desktop and some 80 ms on a phone as the page wakes up, and they always come to the
 * same numbers. `tests/unit/components/game/Blackjack/published.test.tsx` works them out afresh and checks that every
 * figure here is exactly what the reckoning gives, to the last bit; a change to a rule, a pay or a medal bet fails it
 * until this is written out again (the test prints what to write). The basic-strategy chart and the dealer's
 * outcomes cost next to nothing and are still worked out as the Odds tab is drawn.
 */

import type { GameValue, Total } from './analysis';

/** The game's value with perfect play under the table's rules (`gameValue()`). */
export const PUBLISHED_VALUE: Readonly<GameValue> = {
  ev: -0.005117336368389413,
  houseEdge: 0.005117336368389413,
  playerBlackjack: 0.04733727810650888,
  dealerBlackjack: 0.04733727810650888,
};

/** The rules the Odds tab compares, by the change each makes to the table's. */
export type RuleVariantId = 'table' | 'surrender' | 'splitOnce' | 'noDas' | 'h17' | 'sixFive';

/** The house edge with perfect play under each rule the Odds tab compares (`gameValue(rules).houseEdge`). */
export const PUBLISHED_VARIANT_EDGES: Readonly<Record<RuleVariantId, number>> = {
  table: 0.005117336368389413,
  surrender: 0.0042622316475698155,
  splitOnce: 0.005703880122735882,
  noDas: 0.006525382541013317,
  h17: 0.007310957721138572,
  sixFive: 0.0186462744307822,
};

/** Two fixed ways of playing the Odds tab sets beside perfect play: hit and stand only, never doubling or splitting. */
export const PLAYS_LIKE_THE_DEALER = (hand: Total): boolean => hand.total < 17;
export const NEVER_BUSTS = (hand: Total): boolean => hand.total <= 11 || (hand.soft && hand.total < 18);

/** The house edge of each fixed way of playing (`−policyValue(policy)`). */
export const PUBLISHED_POLICY_EDGES: Readonly<{ mimic: number; neverBust: number }> = {
  mimic: 0.056746301584069236,
  neverBust: 0.0607928521240003,
};

/** The house edge with perfect play at each medal bet the table takes (`medalBetEdge(bet)`). */
export const PUBLISHED_MEDAL_BET_EDGES: Readonly<Record<number, number>> = {
  1: 0.02766556647237736,
  2: 0.005117336368389413,
  3: 0.01263341306971871,
  4: 0.005117336368389413,
  5: 0.009626982389187005,
  6: 0.005117336368389413,
  7: 0.008338512097530518,
  8: 0.005117336368389413,
  9: 0.007622695268832511,
  10: 0.005117336368389413,
};
