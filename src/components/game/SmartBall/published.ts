/**
 * Hot Spring Smart Ball's exact odds as the machine publishes them: what `analyze()` (engine.ts) works out for the
 * three hands (perfect play, the everyday hand and blind shots), each a return and the chance of ending with no line,
 * one, two and three, written out here once.
 *
 * The page shows these, so that opening it never works them out again: the reckoning runs a dynamic programme over
 * every set of lit holes and marbles left, three times over, in BigInts (most of a second on a desktop), and it always
 * comes to the same fractions. `tests/unit/components/game/SmartBall/published.test.tsx` works them out afresh and
 * checks that every figure here is exactly what the reckoning gives; a change to a strength's chances, a pay or a rule
 * fails it until this is written out again (the test prints what to write). Only the Odds tab's check by play works
 * anything out, when it is asked to play.
 */

import type { Fraction, MachineOdds } from './engine';

/** A fraction in lowest terms, written as its two whole numbers (the site's TypeScript targets a version before BigInt literals). */
const q = (num: string, den: string): Fraction => ({ num: BigInt(num), den: BigInt(den) });

/** The machine's exact odds (`analyze()`): each hand's return per medal played, and the chance of 0, 1, 2 and 3 lines. */
export const PUBLISHED_SMART_BALL_ODDS: Readonly<MachineOdds> = {
  perfect: {
    back: q('19416340307406796973', '20776019874734407680'),
    lines: [q('15815068211431645895', '33241631799575052288'), q('3828938582304451423', '8310407949893763072'), q('679002015574293059', '11080543933191684096'), q('6150267683560127', '2770135983297921024')],
  },
  typical: {
    back: q('45197797162011668370778531', '58093962176452016713236480'),
    lines: [
      q('37783240334393797334017247', '69712754611742420055883776'),
      q('14402283929710853044359029', '34856377305871210027941888'),
      q('3036747922957169946390029', '69712754611742420055883776'),
      q('44099247484873343379221', '34856377305871210027941888'),
    ],
  },
  blind: {
    back: q('3829070704561965221535175709', '11737422774689101236551024640'),
    lines: [
      q('3718115886751006518336559061', '4694969109875640494620409856'),
      q('460362783299838412722359957', '2347484554937820247310204928'),
      q('6110698902179892248549689', '521663234430626721624489984'),
      q('1252664405003410885', '5198334207894478651392'),
    ],
  },
};
