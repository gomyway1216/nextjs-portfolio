import { describe, expect, it } from 'vitest';

import { getStrings, type HorseStrings } from '@/components/game/HorseRace/i18n';
import { MARGINS, type Call } from '@/components/game/HorseRace/race';
import { STABLE } from '@/components/game/HorseRace/stable';

// The machine's words: nothing of them reads as money, and the race caller's every line fits the two lines kept for it
// on the narrowest phone, whichever horses it names.

/** Every string the machine shows, its functions called with typical values. */
function everyString(t: HorseStrings): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') {
      try {
        const said = (value as (...args: unknown[]) => unknown)(12, 34, 5, 6);
        if (typeof said === 'string') out.push(said);
      } catch {
        // A function that wants other arguments (the caller's lines) is checked below.
      }
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(t);
  return out;
}

const MONEY_EN = /\b(bank|deposit|withdraw|balance|cash|money|pay(?:out)?s? out|bet slip)\b|\$|¥/i;
const MONEY_JA = /預け|預かり|引き出し|残高|お金|換金|現金/;

/** Every line the caller can say, with the two longest names in the stable. */
function everyCall(t: HorseStrings, language: 'en' | 'ja'): string[] {
  const longest = [...STABLE].sort((a, b) => b.name[language].length - a.name[language].length);
  const horse = (gate: number) => `①${longest[gate - 1].name[language]}`;
  const calls: Call[] = [
    { kind: 'off', t: 0 },
    { kind: 'early', t: 1, leader: 1, second: 2 },
    { kind: 'turn', t: 2, leader: 1, second: 2 },
    { kind: 'home', t: 3, leader: 1, second: 2, lengths: 3 },
    { kind: 'home', t: 3, leader: 1, second: 2, lengths: 0.5 },
    { kind: 'straight', t: 4, leader: 1 },
    { kind: 'final', t: 5, leader: 1, chaser: 2, mode: 'flying' },
    { kind: 'final', t: 5, leader: 1, chaser: 2, mode: 'close' },
    { kind: 'final', t: 5, leader: 1, chaser: 2, mode: 'clear' },
    { kind: 'post', t: 6, winner: 1, photo: true },
    { kind: 'post', t: 6, winner: 1, photo: false },
    ...MARGINS.map((margin): Call => ({ kind: 'result', t: 7, winner: 1, second: 2, margin: margin.id, photo: false })),
  ];
  return calls.map((call) => t.call(call, horse));
}

describe('the machine’s words', () => {
  it('never read as money, in either language', () => {
    for (const text of everyString(getStrings('en'))) expect(text).not.toMatch(MONEY_EN);
    for (const text of everyString(getStrings('ja'))) expect(text).not.toMatch(MONEY_JA);
    for (const text of everyCall(getStrings('en'), 'en')) expect(text).not.toMatch(MONEY_EN);
    for (const text of everyCall(getStrings('ja'), 'ja')) expect(text).not.toMatch(MONEY_JA);
  });

  it('give the race caller lines that fit two lines on a 320px phone, whichever horses they name', () => {
    // About 21 Japanese characters, or about 38 English ones, to a line of the caller's box at 320px (tests/e2e checks
    // the box itself during races there).
    for (const line of everyCall(getStrings('ja'), 'ja')) expect(line.length, line).toBeLessThanOrEqual(40);
    for (const line of everyCall(getStrings('en'), 'en')) expect(line.length, line).toBeLessThanOrEqual(72);
  });

  it('name every margin and every way of running in both languages', () => {
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      for (const margin of MARGINS) expect(t.margin[margin.id].length).toBeGreaterThan(0);
      for (const horse of STABLE) expect(t.styleName[horse.style].length).toBeGreaterThan(0);
    }
  });
});
