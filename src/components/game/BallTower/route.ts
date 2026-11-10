/**
 * The way a ball came down the tower, disc by disc, with the chance of each step: for the panel beside the machine that
 * looks back at a run (RunRoute.tsx). Read off the tower as it is built (`DISCS`, `LAMP_SETS`), exactly, as fractions;
 * nothing here draws anything or touches the medals.
 *
 * A step is the pocket the ball settled in on one disc. Its chance is how many of the disc's pockets are marked the
 * same (the same kind; for a pocket that pays, the same multiple) out of the disc's count, each pocket as likely as any other;
 * for a "?" pocket, times how many of the roulette's lamps show the multiple it stopped on, out of its lamps. The chance
 * of the whole way down is the steps' chances multiplied together.
 */

import { DISCS, LAMP_SETS, POCKETS, fraction, times, valueOf, type Fraction, type PocketKind, type Run } from './engine';

export interface Step {
  level: number;
  kind: PocketKind;
  /** What the pocket paid per medal bet (a "?" pocket: the lamp's multiple); 0 for UP and OUT. */
  pays: number;
  /** How many of the disc's pockets are of this kind (and pay this multiple), out of `of`. */
  pockets: number;
  of: number;
  /** For a "?" pocket: how many of the roulette's lamps show the multiple, out of how many. Null otherwise. */
  lamps: { count: number; of: number } | null;
  /** The chance of this step for a ball on the disc. */
  chance: Fraction;
}

export interface Route {
  steps: Step[];
  /** The chance a ball settles in pockets marked the same (a "?" pocket's lamps stopping on the same multiple) all the way down. */
  chance: Fraction;
}

/** The way a run went: every disc it settled on, top first, and the chance of each step and of them all. */
export function routeOf(run: Run): Route {
  let chance = fraction(1);
  const steps = run.stops.map((stop): Step => {
    const { level, kind } = stop;
    const of = POCKETS[level];
    const pockets = DISCS[level].filter((p) => p.kind === kind && (p.kind !== 'pay' || p.pays === stop.pays)).length;
    let own = fraction(pockets, of);
    let lamps: Step['lamps'] = null;
    if (kind === 'mystery') {
      const set = LAMP_SETS[level];
      lamps = { count: set.filter((n) => n === stop.pays).length, of: set.length };
      own = times(own, fraction(lamps.count, lamps.of));
    }
    chance = times(chance, own);
    return { level, kind, pays: stop.pays, pockets, of, lamps, chance: own };
  });
  return { steps, chance };
}

/**
 * How many decimals a share needs as a percentage so that it never reads as nothing: one from 10% up, two from 1%, and
 * below that enough for two figures that count (1/3240 is 0.031%, not 0.03% or 0.0%).
 */
export function percentDigits(share: number): number {
  const percent = share * 100;
  if (!(percent > 0) || percent >= 10) return 1;
  if (percent >= 1) return 2;
  return Math.min(8, Math.ceil(-Math.log10(percent)) + 1);
}

/** A fraction as a percentage in a locale's digits, with the decimals `percentDigits` gives it. */
export function percentOf(share: Fraction, locale: string): string {
  const value = valueOf(share);
  const digits = percentDigits(value);
  return `${(value * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
