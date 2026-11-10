import { describe, expect, it } from 'vitest';

import { castsLogged, emptyLog, kindsLanded, logged } from '@/components/game/Fishing/catchLog';
import { CHEST, FISH, drawCast, resolveCast, seeded, type Bet, type Cast } from '@/components/game/Fishing/engine';

const cast = (fish: Cast['fish'], landed: boolean, prize: number | null = null): Cast => ({ fish, landed, prize });

describe('the catch log', () => {
  it('starts with a row of zeros for every fish and no cast counted', () => {
    const log = emptyLog();
    expect(Object.keys(log.fish).sort()).toEqual(FISH.map((fish) => fish.id).sort());
    for (const fish of FISH) expect(log.fish[fish.id]).toEqual({ landed: 0, away: 0, medals: 0 });
    expect(log.noBite).toBe(0);
    expect(kindsLanded(log)).toBe(0);
    expect(castsLogged(log)).toBe(0);
  });

  it('counts a fish landed with the medals it gave at the bet of that cast', () => {
    let log = logged(emptyLog(), resolveCast(cast('bream', true), 3));
    expect(log.fish.bream).toEqual({ landed: 1, away: 0, medals: 15 });
    log = logged(log, resolveCast(cast('bream', true), 1));
    expect(log.fish.bream).toEqual({ landed: 2, away: 0, medals: 20 });
    expect(kindsLanded(log)).toBe(1);
  });

  it('counts a fish that got away, with no medals and no kind landed', () => {
    const log = logged(emptyLog(), resolveCast(cast('lord', false), 5));
    expect(log.fish.lord).toEqual({ landed: 0, away: 1, medals: 0 });
    expect(kindsLanded(log)).toBe(0);
    expect(castsLogged(log)).toBe(1);
  });

  it('counts a chest landed with the prize it opened on', () => {
    const top = CHEST.length - 1;
    const log = logged(emptyLog(), resolveCast(cast('chest', true, top), 5));
    expect(log.fish.chest).toEqual({ landed: 1, away: 0, medals: CHEST[top].pays * 5 });
  });

  it('counts a cast nothing bit apart from every fish', () => {
    const log = logged(emptyLog(), resolveCast(cast(null, false), 1));
    expect(log.noBite).toBe(1);
    for (const fish of FISH) expect(log.fish[fish.id]).toEqual({ landed: 0, away: 0, medals: 0 });
  });

  it('leaves the log it was given as it was', () => {
    const before = emptyLog();
    const after = logged(before, resolveCast(cast('fry', true), 1));
    expect(before).toEqual(emptyLog());
    expect(after).not.toBe(before);
    expect(after.fish.goby).toBe(before.fish.goby);
  });

  it('adds up to the casts and the medals of a long run of the machine’s own casts', () => {
    const random = seeded(20261110);
    const bets: Bet[] = [1, 3, 5];
    let log = emptyLog();
    let won = 0;
    let caught = 0;
    const kinds = new Set<string>();
    const casts = 5_000;
    for (let i = 0; i < casts; i++) {
      const result = resolveCast(drawCast(random), bets[i % bets.length]);
      won += result.win;
      if (result.win > 0) {
        caught += 1;
        kinds.add(result.cast.fish!);
      }
      log = logged(log, result);
    }
    expect(castsLogged(log)).toBe(casts);
    expect(FISH.reduce((sum, fish) => sum + log.fish[fish.id].medals, 0)).toBe(won);
    expect(FISH.reduce((sum, fish) => sum + log.fish[fish.id].landed, 0)).toBe(caught);
    expect(kindsLanded(log)).toBe(kinds.size);
  });
});
