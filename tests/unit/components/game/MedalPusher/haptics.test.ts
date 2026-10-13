import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DROP_INTERVAL } from '@/components/game/MedalPusher/engine';
import {
  HAPTICS,
  HAPTIC_NAMES,
  UNFELT,
  afterBuzz,
  buzz,
  canVibrate,
  hapticFor,
  hapticLength,
  mayBuzz,
  noteFed,
  stopBuzz,
  takeFed,
  type Buzzed,
  type FedBy,
  type Haptic,
  type Vibrator,
} from '@/components/game/MedalPusher/haptics';
import type { SpinResult } from '@/components/game/MedalPusher/lottery';
import { HOLD_DELAY } from '@/components/game/MedalPusher/PlayTab';
import { advance, createSession, insert, type SessionEvent } from '@/components/game/MedalPusher/session';

/** Plays a timeline of wishes through the rule and returns the ones that were felt. */
function felt(wishes: readonly (readonly [number, Haptic])[]): (readonly [number, Haptic])[] {
  let state: Buzzed = UNFELT;
  const through: (readonly [number, Haptic])[] = [];
  for (const [at, name] of wishes) {
    if (!mayBuzz(state, name, at)) continue;
    state = afterBuzz(state, name, at);
    through.push([at, name]);
  }
  return through;
}

/** A phone: it has a motor, a touch screen, and has been touched. */
const phone = () => {
  const sent: (number | number[])[] = [];
  const nav: Vibrator = {
    vibrate: (pattern) => {
      sent.push(pattern);
      return true;
    },
    maxTouchPoints: 5,
    userActivation: { hasBeenActive: true },
  };
  return { nav, sent };
};

// Nothing is carried over from one test to the next: no pattern playing, nothing felt.
beforeEach(() => stopBuzz(null));
afterEach(() => vi.unstubAllGlobals());

describe('the patterns', () => {
  it('are a tick for a medal, something stronger for a win and something long for the jackpot', () => {
    expect(HAPTIC_NAMES).toEqual(['feed', 'stream', 'catch', 'jewel', 'start', 'crash', 'chance', 'line', 'prize', 'jackpot']);
    for (const name of HAPTIC_NAMES) {
      const { pattern, rank, gap } = HAPTICS[name];
      // On, off, on: an odd number of whole milliseconds, each long enough for a motor to answer.
      expect(pattern.length % 2).toBe(1);
      for (const part of pattern) {
        expect(Number.isInteger(part)).toBe(true);
        expect(part).toBeGreaterThanOrEqual(10);
      }
      expect(Number.isInteger(rank)).toBe(true);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(hapticLength(name)).toBe(pattern.reduce((sum: number, part: number) => sum + part, 0));
    }
    // A tick is one short buzz.
    expect(HAPTICS.feed.pattern).toEqual([15]);
    expect(HAPTICS.stream.pattern).toEqual(HAPTICS.feed.pattern);
    // Each thing that matters more is longer in the hand, and the jackpot is over a second.
    const order: Haptic[] = ['feed', 'catch', 'line', 'prize', 'jackpot'];
    for (let i = 1; i < order.length; i++) {
      expect(HAPTICS[order[i]].rank).toBeGreaterThan(HAPTICS[order[i - 1]].rank);
      expect(hapticLength(order[i])).toBeGreaterThan(hapticLength(order[i - 1]));
    }
    expect(hapticLength('jackpot')).toBeGreaterThanOrEqual(1000);
    expect(hapticLength('jackpot')).toBeLessThanOrEqual(2000);
    expect(HAPTICS.jackpot.pattern.length).toBeGreaterThanOrEqual(5);
  });
});

describe('the rule for what may be felt when', () => {
  it('lets every press be felt, down to two thumbs landing together', () => {
    // Taps a sixth of a second apart, as fast as a thumb goes.
    const taps = Array.from({ length: 12 }, (_, i) => [i * 160, 'feed'] as const);
    expect(felt(taps)).toHaveLength(12);
    // Two thumbs at the same instant are one tick; 60 ms apart they are two.
    expect(
      felt([
        [0, 'feed'],
        [10, 'feed'],
      ]),
    ).toHaveLength(1);
    expect(
      felt([
        [0, 'feed'],
        [60, 'feed'],
      ]),
    ).toHaveLength(2);
  });

  it('holds a held button to three ticks a second, however fast the medals go in', () => {
    // One rail held for ten seconds: the press, then a medal every DROP_INTERVAL from a fifth of a second on.
    const one: (readonly [number, Haptic])[] = [[0, 'feed']];
    for (let at = 200; at <= 10_000; at += DROP_INTERVAL * 1000) one.push([at, 'stream']);
    expect(one.length).toBeGreaterThan(50);
    const ticks = felt(one);
    expect(ticks.length).toBeLessThanOrEqual(31);
    expect(ticks.length).toBeGreaterThanOrEqual(25);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i][0] - ticks[i - 1][0]).toBeGreaterThanOrEqual(HAPTICS.stream.gap);
    // Both rails held: twice the medals, and no more ticks.
    const both = [...one, ...one.map(([at, name]) => [at + 90, name] as const)].sort((a, b) => a[0] - b[0]);
    const together = felt(both);
    expect(together.length).toBeLessThanOrEqual(32);
    for (let i = 2; i < together.length; i++) expect(together[i][0] - together[i - 1][0]).toBeGreaterThanOrEqual(HAPTICS.stream.gap);
    expect(HAPTICS.stream.gap).toBeGreaterThanOrEqual(300);
    expect(1000 / HAPTICS.stream.gap).toBeLessThanOrEqual(3.1);
  });

  it('holds medals over the front to one buzz every 220 ms, whatever ticks come between', () => {
    const wishes: (readonly [number, Haptic])[] = [];
    for (let at = 0; at < 3000; at += 16) wishes.push([at, 'catch']);
    for (let at = 5; at < 3000; at += 70) wishes.push([at, 'feed']);
    wishes.sort((a, b) => a[0] - b[0]);
    const catches = felt(wishes).filter(([, name]) => name === 'catch');
    expect(catches.length).toBeLessThanOrEqual(14);
    expect(catches.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < catches.length; i++) expect(catches[i][0] - catches[i - 1][0]).toBeGreaterThanOrEqual(HAPTICS.catch.gap);
  });

  it('lets a jewel through among falling medals, and holds the medals back behind it', () => {
    // Medals have just been felt going over. The jewel that goes over 30 ms after them is felt all the same.
    const medals = afterBuzz(UNFELT, 'catch', 1000);
    expect(mayBuzz(medals, 'catch', 1030)).toBe(false);
    expect(mayBuzz(medals, 'jewel', 1030)).toBe(true);
    // While its tick plays a medal's does not cut it short, and the medals' own gap runs from it.
    const jewel = afterBuzz(medals, 'jewel', 1030);
    expect(mayBuzz(jewel, 'catch', 1040)).toBe(false);
    expect(mayBuzz(jewel, 'catch', 1030 + HAPTICS.catch.gap - 1)).toBe(false);
    expect(mayBuzz(jewel, 'catch', 1030 + HAPTICS.catch.gap)).toBe(true);
    // Two jewels in a row are two ticks.
    expect(mayBuzz(jewel, 'jewel', 1030 + hapticLength('jewel'))).toBe(true);
  });

  it('never cuts a pattern short for one that matters less, and always gives way to one that matters more', () => {
    // Ticks and falling medals all through a jackpot: none of them is felt until it is over.
    const wishes: (readonly [number, Haptic])[] = [[1000, 'jackpot']];
    for (let at = 1001; at < 1000 + hapticLength('jackpot') + 400; at += 37) wishes.push([at, at % 2 ? 'feed' : 'catch'], [at + 1, 'prize']);
    const through = felt(wishes);
    expect(through[0]).toEqual([1000, 'jackpot']);
    for (const [at] of through.slice(1)) expect(at).toBeGreaterThanOrEqual(1000 + hapticLength('jackpot'));
    expect(through.length).toBeGreaterThan(1);
    // The other way round, the stronger one is felt at once.
    expect(
      felt([
        [0, 'feed'],
        [1, 'catch'],
        [2, 'start'],
        [3, 'line'],
        [4, 'prize'],
        [5, 'jackpot'],
      ]),
    ).toHaveLength(6);
    // Two prizes one after the other are both felt: the second begins again.
    expect(
      felt([
        [0, 'prize'],
        [50, 'prize'],
      ]),
    ).toHaveLength(2);
  });

  it('starts with nothing held back, and a clock that goes backwards holds nothing back', () => {
    for (const name of HAPTIC_NAMES) expect(mayBuzz(UNFELT, name, 0)).toBe(true);
    const state = afterBuzz(UNFELT, 'stream', 5000);
    expect(mayBuzz(state, 'stream', 5100)).toBe(false);
    expect(mayBuzz(state, 'stream', 100)).toBe(true);
    expect(afterBuzz(UNFELT, 'jackpot', 10)).toMatchObject({ until: 10 + hapticLength('jackpot'), rank: HAPTICS.jackpot.rank });
  });
});

describe('what the hand feels of a frame', () => {
  const spin = (tier: SpinResult['tier']): SpinResult => ({ tier }) as SpinResult;

  it('is the one thing that matters most', () => {
    expect(hapticFor([])).toBeNull();
    expect(hapticFor([{ type: 'landed', count: 3 }])).toBeNull();
    expect(hapticFor([{ type: 'lost', count: 1 }])).toBeNull();
    expect(hapticFor([{ type: 'won', count: 2 }])).toBe('catch');
    expect(hapticFor([{ type: 'checker', gate: 1, held: true, gold: false }])).toBe('start');
    // A pocket that finds the hold full starts no spin, and is not felt for itself, whether or not it turned one gold.
    expect(hapticFor([{ type: 'checker', gate: 1, held: false, gold: false }])).toBeNull();
    expect(hapticFor([{ type: 'checker', gate: 1, held: false, gold: true }])).toBeNull();
    // Chance time beginning is: two ticks, heavier than a pocket's and as short. Its ending is not.
    expect(hapticFor([{ type: 'chanceStart' }])).toBe('chance');
    expect(hapticFor([{ type: 'checker', gate: 1, held: false, gold: true }, { type: 'chanceStart' }])).toBe('chance');
    expect(hapticFor([{ type: 'chanceEnd' }])).toBeNull();
    expect(HAPTICS.chance.pattern).toEqual([24, 40, 24]);
    expect(HAPTICS.chance.rank).toBeGreaterThan(HAPTICS.start.rank);
    expect(hapticLength('chance')).toBeLessThan(hapticLength('line'));
    expect(hapticFor([{ type: 'toppled', count: 1 }])).toBe('crash');
    // A jewel over the front is a light tick of its own, felt over the medals that go over with it and never held back
    // by them; the one that makes the set is a prize, like any other that is paid.
    expect(hapticFor([{ type: 'jewel', lamps: 2, payout: 1 }])).toBe('jewel');
    expect(hapticFor([{ type: 'won', count: 3 }, { type: 'jewel', lamps: 2, payout: 1 }])).toBe('jewel');
    expect(hapticFor([{ type: 'jewel', lamps: 2, payout: 1 }, { type: 'won', count: 3 }])).toBe('jewel');
    expect(hapticFor([{ type: 'jewelBonus', payout: 3 }])).toBe('prize');
    expect(hapticFor([{ type: 'jewel', lamps: 4, payout: 1 }, { type: 'jewelBonus', payout: 3 }])).toBe('prize');
    expect(HAPTICS.jewel.pattern).toEqual([28]);
    expect(hapticLength('jewel')).toBeGreaterThan(hapticLength('catch'));
    expect(hapticLength('jewel')).toBeLessThan(hapticLength('start'));
    expect(HAPTICS.jewel.rank).toBeGreaterThan(HAPTICS.catch.rank);
    expect(HAPTICS.jewel.rank).toBeLessThan(HAPTICS.prize.rank);
    expect(HAPTICS.jewel.gap).toBe(0);
    expect(hapticFor([{ type: 'ball', count: 1 }])).toBe('line');
    expect(hapticFor([{ type: 'spinEnd', result: spin('small') }])).toBe('line');
    expect(hapticFor([{ type: 'spinEnd', result: spin('seven') }])).toBe('line');
    expect(hapticFor([{ type: 'spinEnd', result: spin('miss') }])).toBeNull();
    expect(hapticFor([{ type: 'sugorokuEnd', square: 3, payout: 5, fever: false }])).toBe('prize');
    expect(hapticFor([{ type: 'chestEnd', chest: 0, payout: 30 }])).toBe('prize');
    expect(hapticFor([{ type: 'rouletteStep', pocket: 2, medals: 50, level: 1 }])).toBe('prize');
    // Through a hole to the bowl below: a step, felt as a winning line is.
    expect(hapticFor([{ type: 'bowlDrop', bowl: 0, hole: 1, duration: 6 }])).toBe('line');
    expect(hapticFor([{ type: 'bowlEnd', bowl: 0, hole: 1, payout: 50, poured: 15, total: 250, jackpot: false }])).toBe('prize');
    expect(hapticFor([{ type: 'bowlEnd', bowl: 2, hole: 0, payout: 300, poured: 90, total: 500, jackpot: true }])).toBe('jackpot');
    // Several things in one frame: the strongest, whatever order they came in.
    const busy: SessionEvent[] = [
      { type: 'won', count: 4 },
      { type: 'bowlEnd', bowl: 2, hole: 0, payout: 300, poured: 90, total: 500, jackpot: true },
      { type: 'checker', gate: 0, held: true, gold: false },
      { type: 'landed', count: 1 },
    ];
    expect(hapticFor(busy)).toBe('jackpot');
    expect(hapticFor([...busy].reverse())).toBe('jackpot');
    expect(
      hapticFor([
        { type: 'won', count: 1 },
        { type: 'checker', gate: 2, held: true, gold: false },
      ]),
    ).toBe('start');
  });

  it('says nothing for what only begins', () => {
    const quiet: SessionEvent[] = [
      { type: 'spinStart', result: spin('big'), duration: 1.6 },
      { type: 'sugorokuStart', roll: 3, from: 0 },
      { type: 'chestStart' },
      { type: 'chestPicked', chest: 1 },
      { type: 'rouletteStart', pocket: 2, duration: 2.8 },
      { type: 'rouletteEnd', total: 0, level: 0 },
      { type: 'bowlStart', holes: [1, 0, 0], duration: 6.5 },
      // A jewel thrown from the hatch has only begun as well: it is felt when it is collected.
      { type: 'jewelDrop' },
    ];
    for (const event of quiet) expect(hapticFor([event])).toBeNull();
  });
});

describe('buzz', () => {
  it('plays the pattern on a phone that has been touched, and says that it did', () => {
    const { nav, sent } = phone();
    expect(buzz('feed', true, 0, nav)).toBe(true);
    expect(buzz('jackpot', true, 10, nav)).toBe(true);
    expect(sent).toEqual([[15], [...HAPTICS.jackpot.pattern]]);
    // The table itself is never handed out to be changed.
    expect(sent[1]).not.toBe(HAPTICS.jackpot.pattern);
  });

  it('goes by the rule: a tick during the jackpot is not sent', () => {
    const { nav, sent } = phone();
    expect(buzz('jackpot', true, 0, nav)).toBe(true);
    expect(buzz('feed', true, 300, nav)).toBe(false);
    expect(buzz('stream', true, 600, nav)).toBe(false);
    expect(buzz('feed', true, hapticLength('jackpot') + 1, nav)).toBe(true);
    expect(sent).toHaveLength(2);
    // What was not sent is not remembered as felt: the next tick is not held back by it.
    stopBuzz(null);
    expect(buzz('stream', true, 0, nav)).toBe(true);
    expect(buzz('stream', true, 100, nav)).toBe(false);
    expect(buzz('stream', true, 200, nav)).toBe(false);
    expect(buzz('stream', true, 330, nav)).toBe(true);
  });

  it('does nothing with vibration switched off', () => {
    const { nav, sent } = phone();
    for (const name of HAPTIC_NAMES) expect(buzz(name, false, 0, nav)).toBe(false);
    expect(sent).toEqual([]);
    // And switched on again nothing has been used up.
    expect(buzz('feed', true, 1, nav)).toBe(true);
  });

  it('does nothing, and throws nothing, where there is no motor to work', () => {
    // An iPhone: no navigator.vibrate at all.
    expect(buzz('feed', true, 0, { maxTouchPoints: 5 })).toBe(false);
    expect(buzz('feed', true, 0, null)).toBe(false);
    expect(buzz('feed', true, 0, { vibrate: 'yes' as unknown as Vibrator['vibrate'] })).toBe(false);
    // A browser that throws instead of refusing.
    const angry: Vibrator = {
      vibrate: () => {
        throw new Error('NotAllowedError');
      },
    };
    expect(() => buzz('jackpot', true, 0, angry)).not.toThrow();
    expect(buzz('jackpot', true, 1, angry)).toBe(false);
    expect(() => stopBuzz(angry)).not.toThrow();
    expect(() => stopBuzz(null)).not.toThrow();
    expect(() => stopBuzz({})).not.toThrow();
    // Nor does stopping a pattern that is playing, on a browser that throws when it is asked to.
    expect(buzz('prize', true, 2, phone().nav)).toBe(true);
    expect(() => stopBuzz(angry)).not.toThrow();
    expect(buzz('prize', true, 3, phone().nav)).toBe(true);
    expect(() => stopBuzz({})).not.toThrow();
  });

  it('asks nothing of a browser before the page has been touched, which it would refuse out loud', () => {
    const sent: unknown[] = [];
    const untouched: Vibrator = { vibrate: (pattern) => sent.push(pattern) > 0, userActivation: { hasBeenActive: false } };
    expect(buzz('catch', true, 0, untouched)).toBe(false);
    expect(sent).toEqual([]);
    // A browser that does not say whether it has been touched is simply asked.
    expect(buzz('catch', true, 0, { vibrate: (pattern) => sent.push(pattern) > 0 })).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('finds the browser by itself, and is silent where there is none', () => {
    // On the server there is no navigator at all.
    vi.stubGlobal('navigator', undefined);
    expect(() => buzz('feed', true)).not.toThrow();
    expect(buzz('feed', true)).toBe(false);
    expect(canVibrate()).toBe(false);
    expect(() => stopBuzz()).not.toThrow();
    const { nav, sent } = phone();
    vi.stubGlobal('navigator', nav);
    expect(canVibrate()).toBe(true);
    expect(buzz('prize', true)).toBe(true);
    expect(sent).toEqual([[...HAPTICS.prize.pattern]]);
  });

  it('stops what is playing when it is told to, and forgets it', () => {
    const { nav, sent } = phone();
    expect(buzz('jackpot', true, 0, nav)).toBe(true);
    stopBuzz(nav);
    expect(sent[1]).toBe(0);
    // The jackpot that was stopped no longer holds a tick back.
    expect(buzz('feed', true, 10, nav)).toBe(true);
  });

  it('does not carry a jackpot over a reset: the new machine’s first press is felt at once', () => {
    const { nav, sent } = phone();
    // The old machine pays its jackpot, a pattern a second and a quarter long.
    expect(buzz('jackpot', true, 1000, nav)).toBe(true);
    // Left alone, it holds every tick back until it is over.
    expect(buzz('feed', true, 1100, nav)).toBe(false);
    expect(buzz('feed', true, 1000 + hapticLength('jackpot') - 1, nav)).toBe(false);
    // The cabinet is reset a tenth of a second in: the motor is stopped, and what it was playing is forgotten.
    stopBuzz(nav);
    expect(sent).toEqual([[...HAPTICS.jackpot.pattern], 0]);
    // The new machine's first medal goes in straight away, long before the old pattern would have ended, and is felt.
    expect(buzz('feed', true, 1150, nav)).toBe(true);
    expect(sent[2]).toEqual([15]);
    // And the held button after it ticks on the new machine's own time.
    expect(buzz('stream', true, 1150 + HAPTICS.stream.gap - 1, nav)).toBe(false);
    expect(buzz('stream', true, 1150 + HAPTICS.stream.gap, nav)).toBe(true);
  });

  it('does not ask a motor that has played nothing to stop', () => {
    const { nav, sent } = phone();
    // A page hidden, or a tab left, before anything was felt: nothing was playing.
    stopBuzz(nav);
    expect(sent).toEqual([]);
    expect(buzz('feed', true, 0, nav)).toBe(true);
    stopBuzz(nav);
    // Stopped once, it is not stopped again for the same pattern.
    stopBuzz(nav);
    expect(sent).toEqual([[15], 0]);
  });
});

describe('what fed a medal', () => {
  const DT = 1 / 60;

  it('is noted only when the machine took the medal, and what the machine answered is handed back', () => {
    const fed: FedBy[] = [];
    expect(noteFed(fed, 'feed', true)).toBe(true);
    expect(noteFed(fed, 'stream', false)).toBe(false);
    expect(noteFed(fed, 'feed', false)).toBe(false);
    expect(noteFed(fed, 'stream', true)).toBe(true);
    expect(fed).toEqual(['feed', 'stream']);
  });

  it('is taken once: a press if there was one, a held button otherwise, and then nothing', () => {
    expect(takeFed([])).toBeNull();
    expect(takeFed(['stream'])).toBe('stream');
    expect(takeFed(['stream', 'stream'])).toBe('stream');
    expect(takeFed(['feed'])).toBe('feed');
    // Two thumbs in one frame, one pressing and one holding: the press is what is felt.
    expect(takeFed(['stream', 'feed', 'stream'])).toBe('feed');
    const fed: FedBy[] = ['feed', 'stream'];
    expect(takeFed(fed)).toBe('feed');
    expect(fed).toEqual([]);
    expect(takeFed(fed)).toBeNull();
  });

  it('is felt as the tick it was, unless something that matters more happened in the same frame', () => {
    expect(hapticFor([], 'feed')).toBe('feed');
    expect(hapticFor([], 'stream')).toBe('stream');
    expect(hapticFor([], null)).toBeNull();
    expect(hapticFor([{ type: 'landed', count: 1 }], 'feed')).toBe('feed');
    expect(hapticFor([{ type: 'won', count: 1 }], 'feed')).toBe('catch');
    expect(hapticFor([{ type: 'bowlEnd', bowl: 2, hole: 0, payout: 300, poured: 90, total: 500, jackpot: true }], 'stream')).toBe('jackpot');
  });

  it('says nothing for a medal that Auto feeds while the other rail is held and its slot is not free', () => {
    const session = createSession(3);
    const fed: FedBy[] = [];
    const { nav, sent } = phone();
    const frame = (at: number) => {
      const felt = hapticFor([], takeFed(fed));
      if (felt) buzz(felt, true, at, nav);
    };
    // A thumb goes down on R: its medal goes in, and is felt.
    expect(noteFed(fed, 'feed', insert(session, 1))).toBe(true);
    frame(0);
    expect(sent).toEqual([[15]]);
    // The thumb stays down. Long after the tick's own gap, R's slot is asked again the moment after it has taken a
    // medal, and is not free: nothing goes in there. In that same frame Auto feeds the left rail.
    for (let i = 0; i < 60; i++) advance(session, DT);
    expect(noteFed(fed, 'stream', insert(session, 1))).toBe(true);
    frame(1000);
    expect(sent).toEqual([[15], [15]]);
    advance(session, DT);
    expect(session.machine.waits[1]).toBeGreaterThan(0);
    expect(noteFed(fed, 'stream', insert(session, 1))).toBe(false);
    const before = session.inserted;
    expect(insert(session, 0)).toBe(true);
    expect(session.inserted).toBe(before + 1);
    // A medal went in with a button held, and long enough after the last tick for another: but it was Auto's.
    expect(fed).toEqual([]);
    frame(1000 + HAPTICS.stream.gap + 50);
    expect(sent).toEqual([[15], [15]]);
  });

  it('feels a tap once, though the finger is up again before the frame comes', () => {
    const session = createSession(4);
    const fed: FedBy[] = [];
    const { nav, sent } = phone();
    // Down and up between two frames: by the time the frame runs nothing is held, and it may run late.
    expect(noteFed(fed, 'feed', insert(session, 0))).toBe(true);
    const late = HOLD_DELAY * 1000 + 400;
    const first = hapticFor([], takeFed(fed));
    expect(first).toBe('feed');
    expect(buzz(first ?? 'stream', true, late, nav)).toBe(true);
    // The frames after it have nothing more to feel of that medal.
    for (let i = 1; i <= 5; i++) {
      advance(session, DT);
      expect(hapticFor([], takeFed(fed))).toBeNull();
    }
    expect(sent).toEqual([[15]]);
  });

  it('ticks a held button at most every 330 ms, each medal noted as the machine takes it', () => {
    const session = createSession(5);
    const fed: FedBy[] = [];
    const { nav, sent } = phone();
    const ticks: number[] = [];
    let medals = 0;
    // Ten seconds of frames with a thumb on L: the press, and from a fifth of a second on a medal whenever the slot is free.
    for (let i = 0; i < 600; i++) {
      const at = i * DT * 1000;
      if (i === 0 && noteFed(fed, 'feed', insert(session, 0))) medals++;
      if (i * DT >= HOLD_DELAY && noteFed(fed, 'stream', insert(session, 0))) medals++;
      advance(session, DT);
      // Only the medals are of interest here: what the machine did meanwhile is left out.
      const felt = hapticFor([], takeFed(fed));
      if (felt && buzz(felt, true, at, nav)) ticks.push(at);
    }
    expect(medals).toBeGreaterThan(45);
    expect(ticks.length).toBeGreaterThanOrEqual(25);
    expect(ticks.length).toBeLessThanOrEqual(31);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeGreaterThanOrEqual(HAPTICS.stream.gap);
    expect(sent.every((pattern) => Array.isArray(pattern) && pattern.length === 1 && pattern[0] === 15)).toBe(true);
    expect(DROP_INTERVAL * 1000).toBeLessThan(HAPTICS.stream.gap);
  });
});

describe('whether there is a motor', () => {
  it('takes both the function and a touch screen', () => {
    const vibrate = () => true;
    expect(canVibrate({ vibrate, maxTouchPoints: 5 })).toBe(true);
    expect(canVibrate({ vibrate, maxTouchPoints: 1 })).toBe(true);
    // A desktop browser has the function and nothing to shake: no switch there.
    expect(canVibrate({ vibrate, maxTouchPoints: 0 })).toBe(false);
    expect(canVibrate({ vibrate })).toBe(false);
    // Safari on an iPhone has a touch screen and no function: no switch there either.
    expect(canVibrate({ maxTouchPoints: 5 })).toBe(false);
    expect(canVibrate({})).toBe(false);
    expect(canVibrate(null)).toBe(false);
  });
});
