/**
 * Ball Bingo's exact odds as the machine publishes them: the figures that
 * `analyzeMachine()` (engine.ts) works out by dynamic programming over every
 * state a game can be in, written out here once.
 *
 * The page shows these, so that opening it never works them out again: the
 * reckoning takes some tens of milliseconds on a desktop and more on a phone,
 * and it always comes to the same numbers. `tests/unit/components/game/BallBingo/odds.test.ts`
 * works them out afresh and checks that every figure here is exactly what the
 * reckoning gives, to the last bit; a change to a pocket, a ball, a pay or a
 * rule fails it until this is written out again (the test prints what to
 * write).
 */

import type { MachineOdds } from './engine';

export const PUBLISHED_ODDS: MachineOdds = {
  rtp: 0.8997431332867973,
  edge: 0.10025686671320266,
  lines: [
    { lines: 0, chance: 0.7299927519526368, pays: 0, share: 0 },
    { lines: 1, chance: 0.21936594110356122, pays: 2, share: 0.43873188220712245 },
    { lines: 2, chance: 0.03649604971439069, pays: 4, share: 0.14598419885756275 },
    { lines: 3, chance: 0.009689436514049424, pays: 10, share: 0.09689436514049424 },
    { lines: 4, chance: 0.0027765222919961044, pays: 25, share: 0.0694130572999026 },
    { lines: 5, chance: 0.0010117893580298613, pays: 50, share: 0.05058946790149307 },
    { lines: 6, chance: 0.0005890609269692661, pays: 100, share: 0.05890609269692661 },
    { lines: 7, chance: 0, pays: 0, share: 0 },
    { lines: 8, chance: 0.0000784481383665911, pays: 500, share: 0.03922406918329555 },
  ],
  hit: 0.2700072480473632,
  fullCard: 0.0000784481383665911,
  chanceTime: 0.08221498966321465,
  anyFree: 0.22206271157133006,
  meanFrees: 0.2742606523055076,
  meanShots: 5.877361344525222,
  meanMarks: 3.309873914389649,
  chanceShare: 0.4443728200334188,
  sd: 5.602521770976472,
  gamesForOnePercent: 1205812,
  states: 18501,
};
