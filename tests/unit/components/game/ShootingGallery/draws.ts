import { CORKS, FALLEN, PICKS, SET_UP, slotFor, standingOf, type Draw, type Outcome, type Shot } from '@/components/game/ShootingGallery/engine';

/**
 * A draw in which cork `c`, fired at `shots[c]`, does `outcomes[c]`, and in which the blind shot drawn for each cork is
 * that same shot: a play finished blind ends as the one the player was firing.
 */
export function drawFor(shots: readonly Shot[], outcomes: readonly Outcome[]): Draw {
  const positions = [...SET_UP];
  const draw: Draw = { slots: [], picks: [], bands: [] };
  for (let c = 0; c < CORKS; c++) {
    const [target, band] = shots[c];
    const outcome = outcomes[c];
    const slot = slotFor(target, positions[target], band, outcome);
    if (slot < 0) throw new Error(`cork ${c} cannot ${outcome}`);
    const up = standingOf(positions);
    draw.slots.push(slot);
    draw.picks.push(Math.ceil((up.indexOf(target) * PICKS) / up.length));
    draw.bands.push(band);
    if (outcome === 'fall') positions[target] = FALLEN;
    else if (outcome === 'slide') positions[target] += 1;
  }
  return draw;
}
