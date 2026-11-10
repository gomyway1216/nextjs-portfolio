/**
 * The catch log: what every cast shown on this page came to, fish by fish.
 *
 * Only a count of results the machine has already drawn, paid and shown
 * (engine.ts, medals.ts): it is kept on the page, not with the medals, and
 * starts empty whenever the page is opened or the medals are reset.
 */

import { FISH, type CastResult, type FishId } from './engine';

export interface FishCount {
  /** Casts this fish bit and was landed on. */
  landed: number;
  /** Casts this fish bit and got away on. */
  away: number;
  /** The medals its catches gave, at whatever was bet on each. */
  medals: number;
}

export interface CatchLog {
  fish: Record<FishId, FishCount>;
  /** Casts that nothing bit. */
  noBite: number;
}

export const emptyLog = (): CatchLog => ({
  fish: Object.fromEntries(FISH.map((fish) => [fish.id, { landed: 0, away: 0, medals: 0 }])) as Record<FishId, FishCount>,
  noBite: 0,
});

/** The log with one more cast counted in. The log given is left as it was. */
export function logged(log: CatchLog, result: CastResult): CatchLog {
  const { fish, landed } = result.cast;
  if (fish === null) return { ...log, noBite: log.noBite + 1 };
  const was = log.fish[fish];
  const now: FishCount = landed ? { landed: was.landed + 1, away: was.away, medals: was.medals + result.win } : { ...was, away: was.away + 1 };
  return { ...log, fish: { ...log.fish, [fish]: now } };
}

/** How many kinds of fish (the chest and the lord among them) have been landed at least once. */
export const kindsLanded = (log: CatchLog): number => FISH.filter((fish) => log.fish[fish.id].landed > 0).length;

/** Every cast in the log: the ones something bit, and the ones nothing did. */
export const castsLogged = (log: CatchLog): number => FISH.reduce((sum, fish) => sum + log.fish[fish.id].landed + log.fish[fish.id].away, log.noBite);
