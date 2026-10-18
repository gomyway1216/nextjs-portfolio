import { describe, expect, it } from 'vitest';

import { CHEST, FISH, type Cast } from '@/components/game/Fishing/engine';
import { CALM_TIMES, TIMES, chestLights, isEnd, reeledTo, showOf, stepAt } from '@/components/game/Fishing/show';

// The show only plays out what was drawn: every cast ends on the step its result says, a bigger fish takes longer,
// REEL and SKIP only move the show on, and with less motion every show is short.

const casts: Cast[] = [
  { fish: null, landed: false, prize: null },
  ...FISH.flatMap((fish): Cast[] =>
    fish.id === 'chest'
      ? [{ fish: 'chest', landed: false, prize: null }, ...CHEST.map((_, prize): Cast => ({ fish: 'chest', landed: true, prize }))]
      : [
          { fish: fish.id, landed: true, prize: null },
          { fish: fish.id, landed: false, prize: null },
        ],
  ),
];

describe('the show of a cast', () => {
  it('ends on what was drawn: landed, away or nothing', () => {
    for (const cast of casts) {
      for (const calm of [false, true]) {
        const show = showOf(cast, calm);
        const end = cast.fish === null ? 'nothing' : cast.landed ? 'landed' : 'away';
        expect(show.end).toBe(end);
        expect(show.steps.at(-1)).toEqual({ step: end, at: show.length });
        expect(stepAt(show, show.length)).toBe(end);
        expect(stepAt(show, show.length + 10_000)).toBe(end);
        // Steps come in order of time, and only the last is an end.
        for (let i = 1; i < show.steps.length; i++) expect(show.steps[i].at).toBeGreaterThanOrEqual(show.steps[i - 1].at);
        expect(show.steps.filter(({ step }) => isEnd(step))).toHaveLength(1);
        // A bite is shown before any fight, and only a fish that bites is fought.
        const names = show.steps.map(({ step }) => step);
        if (cast.fish === null) expect(names).not.toContain('hooked');
        else if (!calm) expect(names.indexOf('hooked')).toBeLessThan(names.indexOf('fight'));
        // Only a chest landed opens; only the lord is announced.
        expect(names.includes('chest')).toBe(cast.fish === 'chest' && cast.landed);
        expect(names.includes('warning')).toBe(cast.fish === 'lord');
      }
    }
  });

  it('takes longer for a bigger fish, never more than eight seconds, and at most two with less motion', () => {
    const length = (cast: Cast, calm = false) => showOf(cast, calm).length;
    expect(length({ fish: 'fry', landed: true, prize: null })).toBeLessThan(length({ fish: 'bream', landed: true, prize: null }));
    expect(length({ fish: 'bream', landed: true, prize: null })).toBeLessThan(length({ fish: 'marlin', landed: true, prize: null }));
    expect(length({ fish: 'marlin', landed: true, prize: null })).toBeLessThan(length({ fish: 'lord', landed: true, prize: null }));
    for (const cast of casts) {
      expect(length(cast)).toBeLessThanOrEqual(8_000);
      expect(length(cast, true)).toBeLessThanOrEqual(2_000);
    }
    expect(length({ fish: 'lord', landed: true, prize: null })).toBe(TIMES.flight + TIMES.warning + TIMES.wait.lord + TIMES.hooked + TIMES.fight.lord);
    expect(length({ fish: null, landed: false, prize: null }, true)).toBe(CALM_TIMES.empty);
  });

  it('is moved on a step by REEL, and from the last step to the end', () => {
    const show = showOf({ fish: 'tuna', landed: true, prize: null });
    let at = TIMES.flight + 10;
    const seen: string[] = [stepAt(show, at)];
    while (at < show.length) {
      at = reeledTo(show, at);
      seen.push(stepAt(show, at));
    }
    expect(seen).toEqual(['wait', 'hooked', 'fight', 'landed']);
    expect(reeledTo(show, show.length)).toBe(show.length);
  });

  it('runs the chest’s light round its prizes and stops it on the prize drawn', () => {
    for (let prize = 0; prize < CHEST.length; prize++) {
      const lights = chestLights(prize);
      expect(lights.at(-1)!.lit).toBe(prize);
      expect(lights.at(-1)!.at).toBeLessThanOrEqual(TIMES.chest);
      for (let i = 1; i < lights.length; i++) {
        expect(lights[i].at).toBeGreaterThanOrEqual(lights[i - 1].at);
        expect(lights[i].lit).toBe((lights[i - 1].lit + 1) % CHEST.length);
      }
      // It slows as it comes to the prize.
      const gaps = lights.slice(1).map((light, i) => light.at - lights[i].at);
      expect(gaps.at(-1)!).toBeGreaterThan(gaps[0]);
    }
  });
});
