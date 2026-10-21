/**
 * Onsen Shooting Gallery's exact odds as the machine publishes them: what `analyze()` (engine.ts) works out for the
 * three hands (perfect play, the everyday hand and blind shots), each a return, the chance of ending with none of the
 * figures off the shelf, one, two and so on up to six, and the chance of the beckoning cat, written out here once.
 *
 * The page shows these, so that opening it never works them out again: the reckoning runs a dynamic programme over
 * every state the shelf can be in and every count of corks left, three times over, in BigInts (a fraction of a second
 * on a desktop), and it always comes to the same fractions. `tests/unit/components/game/ShootingGallery/published.test.tsx`
 * works them out afresh and checks that every figure here is exactly what the reckoning gives; a change to a figure's
 * chances, a tag or a rule fails it until this is written out again (the test prints what to write). Only the Odds
 * tab's check by play works anything out, when it is asked to play.
 */

import type { Fraction, MachineOdds } from './engine';

/** A fraction in lowest terms, written as its two whole numbers (the site's TypeScript targets a version before BigInt literals). */
const q = (num: string, den: string): Fraction => ({ num: BigInt(num), den: BigInt(den) });

/** The machine's exact odds (`analyze()`): each hand's return per medal played, the chance of 0 to 6 figures off the shelf, and of the cat. */
export const PUBLISHED_SHOOTING_GALLERY_ODDS: Readonly<MachineOdds> = {
  perfect: {
    back: q('123418233', '134217728'),
    fell: [q('49188275', '134217728'), q('51869417', '134217728'), q('10267887', '67108864'), q('4803715', '67108864'), q('2693873', '134217728'), q('322959', '134217728'), q('0', '1')],
    grand: q('1399431', '16777216'),
  },
  typical: {
    back: q('717174278215', '1099511627776'),
    fell: [
      q('121049974567', '549755813888'),
      q('203540824541', '549755813888'),
      q('38490904795', '137438953472'),
      q('1869178175', '17179869184'),
      q('337612375', '17179869184'),
      q('35693875', '34359738368'),
      q('406125', '17179869184'),
    ],
    grand: q('0', '1'),
  },
  blind: {
    back: q('41893736427300226068069948647', '134684704041940744667136000000'),
    fell: [
      q('4160459634357682597', '8916100448256000000'),
      q('3613949516535506122040453', '9349208943630483456000000'),
      q('103990842619559146010043553', '831387061987288547328000000'),
      q('57817012970747837675327', '2886760631900307456000000'),
      q('70888474811554014049', '42957747498516480000000'),
      q('32886643734613', '507343011840000000'),
      q('5838643', '6442450944000'),
    ],
    grand: q('1623079713141076872569431', '7014828335517747118080000000'),
  },
};
