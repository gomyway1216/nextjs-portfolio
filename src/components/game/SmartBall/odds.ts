/**
 * Hot Spring Smart Ball's exact odds as the machine publishes them: the
 * fractions `analyze()` (engine.ts) works out by dynamic programming over
 * every state the board can be in, written out here once.
 *
 * The page shows these, so that opening it never works them out again: the
 * reckoning takes most of a second on a desktop and more on a phone, and it
 * always comes to the same numbers. `tests/unit/components/game/SmartBall/odds.test.ts`
 * works them out afresh and checks that every figure here is exactly what the
 * reckoning gives, to the last digit; a change to a strength's chances, a pay
 * or a rule fails it until this is written out again (the test prints what to
 * write).
 */

import { parseRatio, type MachineOdds, type Player } from './engine';

/** Each player's return per medal played, and the chance of ending with no line, one, two and three, as "num/den". */
export const PUBLISHED: Readonly<Record<Player, { back: string; lines: readonly string[] }>> = {
  perfect: {
    back: '19416340307406796973/20776019874734407680',
    lines: ['15815068211431645895/33241631799575052288', '3828938582304451423/8310407949893763072', '679002015574293059/11080543933191684096', '6150267683560127/2770135983297921024'],
  },
  typical: {
    back: '45197797162011668370778531/58093962176452016713236480',
    lines: ['37783240334393797334017247/69712754611742420055883776', '14402283929710853044359029/34856377305871210027941888', '3036747922957169946390029/69712754611742420055883776', '44099247484873343379221/34856377305871210027941888'],
  },
  blind: {
    back: '3829070704561965221535175709/11737422774689101236551024640',
    lines: ['3718115886751006518336559061/4694969109875640494620409856', '460362783299838412722359957/2347484554937820247310204928', '6110698902179892248549689/521663234430626721624489984', '1252664405003410885/5198334207894478651392'],
  },
};

let odds: MachineOdds | null = null;

/** The published odds, as fractions. */
export function publishedOdds(): MachineOdds {
  if (odds) return odds;
  const read = (player: Player) => ({ back: parseRatio(PUBLISHED[player].back), lines: PUBLISHED[player].lines.map(parseRatio) });
  odds = { perfect: read('perfect'), typical: read('typical'), blind: read('blind') };
  return odds;
}
