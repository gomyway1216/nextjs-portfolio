import { describe, expect, it } from 'vitest';

import {
  HEAP_CAP,
  HEAP_ROWS,
  HEAP_SPOTS,
  SEGMENTS,
  SEGMENT_CELL,
  SEGMENT_NAMES,
  SEGMENT_SHAPES,
  STILL_TRAY,
  TRAY,
  TRAY_AIR,
  TRAY_ARRIVAL,
  TRAY_LEAVE,
  heapCount,
  segmentsFor,
  trayDue,
  trayHappen,
  trayHidden,
  trayLand,
  trayLanding,
  trayStill,
  washed,
  type TrayAir,
  type TrayNews,
} from '@/components/game/MedalPusher/panel';
import { FACES, MEDAL_PAINT } from '@/components/game/MedalPusher/medalLook';
import { START_CREDITS } from '@/components/game/MedalPusher/session';

describe('seven-segment digits', () => {
  it('light the segments a seven-segment display lights for each digit', () => {
    expect(SEGMENT_NAMES).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(SEGMENTS).toEqual({ 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' });
    // No two digits light the same segments, and every segment is used by some digit and left dark by another.
    expect(new Set(Object.values(SEGMENTS)).size).toBe(10);
    for (const name of SEGMENT_NAMES) {
      expect(Object.values(SEGMENTS).some((lit) => lit.includes(name))).toBe(true);
      expect(Object.values(SEGMENTS).some((lit) => !lit.includes(name))).toBe(true);
    }
  });

  it('show a number at the right of the display with nothing in front of it', () => {
    expect(segmentsFor(100, 5)).toEqual(['', '', 'bc', 'abcdef', 'abcdef']);
    expect(segmentsFor(0, 5)).toEqual(['', '', '', '', 'abcdef']);
    expect(segmentsFor(7, 1)).toEqual(['abc']);
    expect(segmentsFor(98765, 5)).toEqual(['abcdfg', 'abcdefg', 'abc', 'acdefg', 'acdfg']);
    // Written with a comma, as the page writes a large number, it is the same number.
    expect(segmentsFor('1,234', 5)).toEqual(segmentsFor(1234, 5));
    expect(segmentsFor('1,234', 4)).toEqual(['bc', 'abdeg', 'abcdg', 'bcfg']);
    expect(segmentsFor('300', 4)).toEqual(['', 'abcdg', 'abcdef', 'abcdef']);
  });

  it('never show what is not a whole number of medals', () => {
    // Nothing written: nothing lit.
    expect(segmentsFor('', 4)).toEqual(['', '', '', '']);
    expect(segmentsFor('—', 4)).toEqual(['', '', '', '']);
    expect(segmentsFor(Number.NaN, 3)).toEqual(['', '', '']);
    expect(segmentsFor(Number.POSITIVE_INFINITY, 3)).toEqual(['', '', '']);
    // A purse is never less than nothing, and has no fractions.
    expect(segmentsFor(-5, 3)).toEqual(['', '', 'abcdef']);
    expect(segmentsFor(12.9, 3)).toEqual(['', 'bc', 'abdeg']);
    // A number too long for the display shows its last places, as a counter that has gone round does.
    expect(segmentsFor(123456, 4)).toEqual(segmentsFor(3456, 4));
    for (const places of [0, -1, 2.5, Number.NaN]) expect(() => segmentsFor(1, places)).toThrow();
  });

  it('are drawn as seven bars inside a cell', () => {
    for (const name of SEGMENT_NAMES) {
      const points = SEGMENT_SHAPES[name].split(' ').map((pair) => pair.split(',').map(Number));
      expect(points.length).toBeGreaterThanOrEqual(4);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(SEGMENT_CELL.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(SEGMENT_CELL.height);
      }
    }
    const middle = (name: 'a' | 'd' | 'g' | 'b' | 'f') => {
      const points = SEGMENT_SHAPES[name].split(' ').map((pair) => pair.split(',').map(Number));
      return { x: points.reduce((sum, [x]) => sum + x, 0) / points.length, y: points.reduce((sum, [, y]) => sum + y, 0) / points.length };
    };
    // The top bar is over the middle one, which is over the bottom one; the right-hand bars are to the right of the left-hand ones.
    expect(middle('a').y).toBeLessThan(middle('g').y);
    expect(middle('g').y).toBeLessThan(middle('d').y);
    expect(middle('f').x).toBeLessThan(middle('b').x);
  });
});

describe('the heap in the tray', () => {
  it('is a mound of sixty medals when it is full', () => {
    expect(HEAP_CAP).toBe(60);
    expect(HEAP_ROWS.reduce((sum, row) => sum + row, 0)).toBe(HEAP_CAP);
    expect(HEAP_SPOTS).toHaveLength(HEAP_CAP);
    // Each row is shorter than the one it lies on.
    for (let row = 1; row < HEAP_ROWS.length; row++) expect(HEAP_ROWS[row]).toBeLessThan(HEAP_ROWS[row - 1]);
    // A new machine's purse is a full tray.
    expect(START_CREDITS).toBeGreaterThanOrEqual(HEAP_CAP);
  });

  it('has a place for every medal, inside the dish, and no two in one place', () => {
    const { medal, width, floor, chute } = TRAY;
    for (const spot of HEAP_SPOTS) {
      expect(spot.x - medal.rx).toBeGreaterThan(4);
      expect(spot.x + medal.rx).toBeLessThan(width - 4);
      expect(spot.y + medal.ry).toBeLessThanOrEqual(floor + medal.ry + 1);
      // Under the mouth of the chute, never in it.
      expect(spot.y - medal.ry).toBeGreaterThan(chute.y + 3);
      expect(Math.abs(spot.tilt)).toBeLessThanOrEqual(8);
    }
    for (let i = 0; i < HEAP_SPOTS.length; i++) {
      for (let j = i + 1; j < HEAP_SPOTS.length; j++) {
        expect(Math.hypot(HEAP_SPOTS[i].x - HEAP_SPOTS[j].x, (HEAP_SPOTS[i].y - HEAP_SPOTS[j].y) * 2)).toBeGreaterThan(3);
      }
    }
  });

  it('is heaped from the bottom up, and each row from its middle outwards', () => {
    // The order the medals are heaped in is row by row.
    for (let i = 1; i < HEAP_SPOTS.length; i++) expect(HEAP_SPOTS[i].row).toBeGreaterThanOrEqual(HEAP_SPOTS[i - 1].row);
    // A higher row lies higher in the dish.
    const height = (row: number) => {
      const spots = HEAP_SPOTS.filter((spot) => spot.row === row);
      return spots.reduce((sum, spot) => sum + spot.y, 0) / spots.length;
    };
    for (let row = 1; row < HEAP_ROWS.length; row++) expect(height(row)).toBeLessThan(height(row - 1) - 3);
    // The first medals of the bottom row are the middle of it: a few medals are a small heap in the middle, not a row from one side.
    const bottom = HEAP_SPOTS.filter((spot) => spot.row === 0);
    const reach = (count: number) => Math.max(...bottom.slice(0, count).map((spot) => Math.abs(spot.x - TRAY.width / 2)));
    expect(reach(1)).toBeLessThan(2);
    expect(reach(3)).toBeLessThan(reach(7));
    expect(reach(7)).toBeLessThan(reach(11));
    // And the heap is the same to either side.
    const mean = HEAP_SPOTS.reduce((sum, spot) => sum + spot.x, 0) / HEAP_SPOTS.length;
    expect(Math.abs(mean - TRAY.width / 2)).toBeLessThan(1.5);
  });

  it('is as many medals as the purse holds, up to a full heap', () => {
    expect(heapCount(0)).toBe(0);
    expect(heapCount(1)).toBe(1);
    expect(heapCount(59)).toBe(59);
    expect(heapCount(60)).toBe(60);
    expect(heapCount(61)).toBe(60);
    expect(heapCount(98765)).toBe(60);
    expect(heapCount(-3)).toBe(0);
    expect(heapCount(7.9)).toBe(7);
    expect(heapCount(Number.NaN)).toBe(0);
    expect(heapCount(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

/** What happened, as the cabinet tells the tray: the purse afterwards, what came in and why, and the medals fed. */
const news = (purse: number, arrived: TrayNews['arrived'] = [], fed: TrayNews['fed'] = []): TrayNews => ({ purse, fed, arrived });
const coming = (air: TrayAir) => air.flights.filter((flight) => flight.way === 'in');
const leaving = (air: TrayAir) => air.flights.filter((flight) => flight.way === 'out');
const hiddenPlaces = (air: TrayAir) => [...trayHidden(air)].sort((a, b) => a - b);
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, index) => from + index);
/** Where a medal on its way in sets off. */
const start = (flight: TrayAir['flights'][number]) => ({ x: flight.x + flight.dx, y: flight.y + flight.dy });
/** Lets every medal in the air land in its turn. Says how many medals were heard at each landing, and what was still hidden after it. */
const settle = (air: TrayAir) => {
  const landings: { at: number; medals: number; hidden: number[] }[] = [];
  let now = air;
  for (let due = trayDue(now); due !== null; due = trayDue(now)) {
    const medals = trayLanding(now, due).reduce((sum, flight) => sum + (flight.way === 'in' ? flight.medals : 0), 0);
    now = trayLand(now, due);
    landings.push({ at: due, medals, hidden: hiddenPlaces(now) });
  }
  return landings;
};

describe('what the tray acts out', () => {
  it('drops medals that were won out of the chute, one after another, each to a place of its own', () => {
    const air = trayHappen(STILL_TRAY, news(13, [{ cause: 'won', count: 3 }]), 1000);
    expect(leaving(air)).toHaveLength(0);
    expect(coming(air).map((flight) => [flight.from, flight.delay, flight.lands, flight.medals, flight.hides])).toEqual([
      ['chute', 0, 1300, 1, [10]],
      ['chute', 70, 1370, 1, [11]],
      ['chute', 140, 1440, 1, [12]],
    ]);
    for (const flight of coming(air)) {
      // Each lands on the place it brings, and comes from inside the mouth of the chute.
      expect([flight.x, flight.y]).toEqual([HEAP_SPOTS[flight.place].x, HEAP_SPOTS[flight.place].y]);
      expect(flight.place).toBe(flight.hides[0]);
      expect(start(flight).y).toBeCloseTo(TRAY.chute.y, 9);
      expect(Math.abs(start(flight).x - TRAY.chute.x)).toBeLessThanOrEqual(TRAY.chute.width / 2 - TRAY.medal.rx);
      expect(flight.time).toBe(TRAY_ARRIVAL.won.time);
    }
    // They do not all fall from one point.
    expect(new Set(coming(air).map((flight) => start(flight).x.toFixed(2))).size).toBe(3);
  });

  it('shows many medals won at once as a few, each standing for its share, and drops them on a heap that is full', () => {
    const air = trayHappen(STILL_TRAY, news(START_CREDITS + 30, [{ cause: 'won', count: 30 }]), 0);
    expect(coming(air)).toHaveLength(TRAY_ARRIVAL.won.medals);
    expect(coming(air).map((flight) => flight.medals)).toEqual([5, 5, 5, 5, 5, 5]);
    // Nothing of a full heap is hidden: they land on the top of it.
    expect(hiddenPlaces(air)).toEqual([]);
    for (const flight of coming(air)) expect(flight.place).toBeGreaterThanOrEqual(HEAP_CAP - HEAP_ROWS[HEAP_ROWS.length - 1]);
    // A heap that fills up on the way: the places it still had are brought, and the rest land on it.
    const filling = trayHappen(STILL_TRAY, news(64, [{ cause: 'won', count: 6 }]), 0);
    expect(hiddenPlaces(filling)).toEqual([58, 59]);
    expect(coming(filling).map((flight) => flight.medals)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("counts the day's bonus out of the chute, a longer run than a win, however large it is", () => {
    // What the size of the change could not say: forty medals in one go are a bonus, and are seen to arrive.
    for (const count of [40, 150]) {
      const air = trayHappen(STILL_TRAY, news(80 + count, [{ cause: 'bonus', count }]), 500);
      expect(coming(air)).toHaveLength(TRAY_ARRIVAL.bonus.medals);
      expect(coming(air).every((flight) => flight.from === 'chute')).toBe(true);
      expect(coming(air).map((flight) => flight.delay)).toEqual(range(0, TRAY_ARRIVAL.bonus.medals).map((n) => n * TRAY_ARRIVAL.bonus.apart));
      expect(coming(air).reduce((sum, flight) => sum + flight.medals, 0)).toBe(count);
    }
    expect(TRAY_ARRIVAL.bonus.medals).toBeGreaterThan(TRAY_ARRIVAL.won.medals);
    expect(TRAY_ARRIVAL.bonus.apart).toBeGreaterThan(TRAY_ARRIVAL.won.apart);
    // Into a small purse it builds the heap up, every flight bringing its share of the new places.
    const small = trayHappen(STILL_TRAY, news(45, [{ cause: 'bonus', count: 40 }]), 500);
    expect(coming(small).map((flight) => flight.hides.length)).toEqual(new Array(10).fill(4));
    expect(hiddenPlaces(small)).toEqual(range(5, 45));
    expect(settle(small).map((landing) => landing.hidden.length)).toEqual([36, 32, 28, 24, 20, 16, 12, 8, 4, 0]);
  });

  it('tips a refill in over the rim, a cupful across the dish, and builds the heap as it comes down', () => {
    const air = trayHappen(STILL_TRAY, news(START_CREDITS, [{ cause: 'refill', count: START_CREDITS }]), 0);
    expect(coming(air)).toHaveLength(TRAY_ARRIVAL.refill.medals);
    for (const flight of coming(air)) {
      expect(flight.from).toBe('cup');
      // From above the dish, over about where it lands: not out of the chute.
      expect(start(flight).y).toBeLessThan(0);
      expect(Math.abs(flight.dx)).toBeLessThanOrEqual(1.5 * TRAY.medal.rx);
      expect(flight.time).toBe(TRAY_ARRIVAL.refill.time);
    }
    // Across the dish, not down the middle of it.
    const landsAt = coming(air).map((flight) => flight.x);
    expect(Math.max(...landsAt) - Math.min(...landsAt)).toBeGreaterThan(TRAY.width / 3);
    expect(coming(air).reduce((sum, flight) => sum + flight.medals, 0)).toBe(START_CREDITS);
    // Nothing lies in the dish until the first of it is down, and then the heap grows with every landing.
    expect(hiddenPlaces(air)).toEqual(range(0, HEAP_CAP));
    const landings = settle(air);
    expect(landings.map((landing) => HEAP_CAP - landing.hidden.length)).toEqual(range(1, 13).map((n) => n * 5));
    expect(landings.map((landing) => landing.at)).toEqual(range(0, 12).map((n) => n * TRAY_ARRIVAL.refill.apart + TRAY_ARRIVAL.refill.time));
    // The whole of it is down in well under a second.
    expect(landings[landings.length - 1].at).toBeLessThan(900);
  });

  it('acts nothing out for a purse that only changed: a machine restored, reset, or swapped for the one on the account', () => {
    // Whatever the purses were, there is nothing to tell the tray but the purse, and it makes no medal fly: the size of
    // a change is never asked why it changed. (20 more by a restore is none; 20 more that were won are six.)
    for (const purse of [START_CREDITS, 80, 37, 1234, 0]) expect(trayHappen(STILL_TRAY, news(purse), 0).flights).toEqual([]);
    expect(trayHappen(STILL_TRAY, news(START_CREDITS, [{ cause: 'won', count: 20 }]), 0).flights).toHaveLength(6);
    // And the medals of the machine before are not left in the air over the new one.
    const before = trayHappen(STILL_TRAY, news(13, [{ cause: 'won', count: 3 }], [1]), 0);
    expect(before.flights.length).toBeGreaterThan(0);
    const put = trayStill(before);
    expect(put.flights).toEqual([]);
    expect(hiddenPlaces(put)).toEqual([]);
    expect(trayDue(put)).toBeNull();
    // The next medal does not take the name of one that was dropped.
    expect(put.next).toBe(before.next);
    expect(Math.min(...trayHappen(put, news(14, [{ cause: 'won', count: 1 }]), 0).flights.map((flight) => flight.id))).toBeGreaterThan(Math.max(...before.flights.map((flight) => flight.id)));
    // A still tray is left as it is.
    expect(trayStill(STILL_TRAY)).toBe(STILL_TRAY);
  });

  it('passes over news that is not a whole number of medals', () => {
    for (const count of [0, -4, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(trayHappen(STILL_TRAY, news(50, [{ cause: 'won', count }]), 0).flights).toEqual([]);
    expect(trayHappen(STILL_TRAY, news(Number.NaN, [{ cause: 'refill', count: 100 }]), 0).flights.length).toBeGreaterThan(0);
  });

  it('keeps the places hidden flight by flight when arrivals overlap, and shows each when its own medal lands', () => {
    // Three medals are won, and two more before the first three are down.
    const first = trayHappen(STILL_TRAY, news(13, [{ cause: 'won', count: 3 }]), 1000);
    const both = trayHappen(first, news(15, [{ cause: 'won', count: 2 }]), 1050);
    expect(coming(both).map((flight) => [flight.lands, flight.hides])).toEqual([
      [1300, [10]],
      [1370, [11]],
      [1440, [12]],
      [1350, [13]],
      [1420, [14]],
    ]);
    // The later medals land between the earlier ones: no one line through the heap says which places are down.
    expect(settle(both).map((landing) => [landing.at, landing.hidden])).toEqual([
      [1300, [11, 12, 13, 14]],
      [1350, [11, 12, 14]],
      [1370, [12, 14]],
      [1420, [12]],
      [1440, []],
    ]);
    // Landing takes out the medals whose time has come, all of them and no others.
    expect(trayLanding(both, 1299)).toEqual([]);
    expect(trayLanding(both, 1360).map((flight) => flight.hides[0])).toEqual([10, 13]);
    expect(trayLand(both, 1360).flights.map((flight) => flight.hides[0])).toEqual([11, 12, 14]);
    expect(trayDue(both)).toBe(1300);
    expect(trayDue(trayLand(both, 1360))).toBe(1370);
    expect(trayDue(STILL_TRAY)).toBeNull();
  });

  it('sends a medal that is fed off the top of the heap, towards the button of its rail', () => {
    const left = trayHappen(STILL_TRAY, news(19, [], [-1]), 200);
    expect(coming(left)).toHaveLength(0);
    expect(leaving(left)).toHaveLength(1);
    expect(leaving(left)[0]).toMatchObject({ place: 19, x: HEAP_SPOTS[19].x, y: HEAP_SPOTS[19].y, dx: -TRAY_LEAVE.reach, dy: -TRAY_LEAVE.lift, lands: 200 + TRAY_LEAVE.time, hides: [], medals: 1 });
    expect(trayHappen(STILL_TRAY, news(19, [], [1]), 200).flights[0].dx).toBe(TRAY_LEAVE.reach);
    // Both rails in one frame: two medals, the top two, one each way.
    const both = trayHappen(STILL_TRAY, news(18, [], [-1, 1]), 200);
    expect(leaving(both).map((flight) => [flight.place, Math.sign(flight.dx)])).toEqual([
      [19, -1],
      [18, 1],
    ]);
    // A purse with more medals than the heap shows: one leaves the top, and the heap is as full as it was.
    const full = trayHappen(STILL_TRAY, news(START_CREDITS - 1, [], [1]), 200);
    expect(leaving(full).map((flight) => flight.place)).toEqual([HEAP_CAP - 1]);
    expect(hiddenPlaces(full)).toEqual([]);
    // Fed medals are not heard in the tray when they are gone.
    expect(settle(both).map((landing) => landing.medals)).toEqual([0]);
  });

  it('never shows more medals than the purse holds, or fewer, when one is fed while others are on their way', () => {
    // Ten in the purse, three won and still in the air (places 10, 11 and 12), and one is fed: twelve.
    const won = trayHappen(STILL_TRAY, news(13, [{ cause: 'won', count: 3 }]), 0);
    const fed = trayHappen(won, news(12, [], [-1]), 50);
    // The medal that is taken is the top one lying there, and the heap no longer has a place 12. The medal that was
    // coming for it fills the place the taken one left.
    expect(leaving(fed).map((flight) => flight.place)).toEqual([9]);
    expect(hiddenPlaces(fed)).toEqual([9, 10, 11]);
    expect(coming(fed).map((flight) => flight.hides)).toEqual([[10], [11], [9]]);
    // Nine lie there and three are coming: twelve, as the purse says.
    expect(heapCount(12) - hiddenPlaces(fed).length + coming(fed).length).toBe(12);
    expect(settle(fed).at(-1)?.hidden).toEqual([]);

    // A refill, and the button already held: with nothing lying in the dish yet, nothing is seen to leave it.
    const poured = trayHappen(STILL_TRAY, news(START_CREDITS, [{ cause: 'refill', count: START_CREDITS }]), 0);
    const held = trayHappen(poured, news(START_CREDITS - 1, [], [1]), 30);
    expect(leaving(held)).toHaveLength(0);
    expect(hiddenPlaces(held)).toEqual(range(0, HEAP_CAP));

    // The last medals of a purse, fed while the medals that made it up are still coming.
    const two = trayHappen(STILL_TRAY, news(2, [{ cause: 'won', count: 2 }]), 0);
    const one = trayHappen(two, news(1, [], [1]), 10);
    expect(hiddenPlaces(one)).toEqual([0]);
    expect(leaving(one)).toHaveLength(0);
    const none = trayHappen(one, news(0, [], [-1]), 20);
    expect(hiddenPlaces(none)).toEqual([]);
  });

  it('holds through any play: no place hidden twice or beyond the heap, every medal heard once, the air never crowded', () => {
    // A long run of frames from a fixed dice: medals fed on both rails, wins small and large, a bonus, the purse run
    // dry and refilled, and now and then a machine put up in the other's place.
    let seed = 20261013;
    const dice = (sides: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 8) % sides;
    };
    let air = STILL_TRAY;
    let purse = 12;
    let told = 0;
    let heard = 0;
    let refills = 0;
    for (let frame = 0; frame < 4000; frame++) {
      const now = frame * 16;
      heard += trayLanding(air, now).reduce((sum, flight) => sum + (flight.way === 'in' ? flight.medals : 0), 0);
      air = trayLand(air, now);
      const roll = dice(60);
      if (roll === 0) {
        // Another machine: what was in the air is never heard.
        told -= coming(air).reduce((sum, flight) => sum + flight.medals, 0);
        air = trayStill(air);
        purse = dice(90);
        continue;
      }
      const fed: (-1 | 1)[] = [];
      for (const side of [-1, 1] as const) if (dice(2) === 0 && purse - fed.length > 0) fed.push(side);
      const arrived: { cause: 'won' | 'bonus' | 'refill'; count: number }[] = [];
      if (roll === 1) arrived.push({ cause: 'bonus', count: 40 + dice(111) });
      if (roll < 8) arrived.push({ cause: 'won', count: roll < 3 ? 20 + dice(40) : 1 + dice(4) });
      purse -= fed.length;
      if (purse === 0 && arrived.length === 0) {
        arrived.push({ cause: 'refill', count: START_CREDITS });
        refills += 1;
      }
      for (const one of arrived) purse += one.count;
      told += arrived.reduce((sum, one) => sum + one.count, 0);
      if (fed.length === 0 && arrived.length === 0) continue;
      air = trayHappen(air, news(purse, arrived, fed), now);

      const hides = air.flights.flatMap((flight) => flight.hides);
      expect(new Set(hides).size, `frame ${frame}: a place hidden twice`).toBe(hides.length);
      expect(Math.max(-1, ...hides), `frame ${frame}: a place the heap has not got`).toBeLessThan(heapCount(purse));
      expect(coming(air).length).toBeLessThanOrEqual(TRAY_AIR.in);
      expect(leaving(air).length).toBeLessThanOrEqual(TRAY_AIR.out);
      expect(new Set(air.flights.map((flight) => flight.id)).size).toBe(air.flights.length);
    }
    heard += settle(air).reduce((sum, landing) => sum + landing.medals, 0);
    expect(heard).toBe(told);
    expect(told).toBeGreaterThan(2000);
    expect(refills).toBeGreaterThan(0);
  });

  it('draws no more medals on their way than can be followed, and loses none of them', () => {
    // Medals going over the front in every frame for a second, as when a tower goes.
    let air = STILL_TRAY;
    let heard = 0;
    for (let frame = 0; frame < 60; frame++) {
      heard += trayLanding(air, frame * 16).reduce((sum, flight) => sum + flight.medals, 0);
      air = trayHappen(trayLand(air, frame * 16), news(START_CREDITS + (frame + 1) * 3, [{ cause: 'won', count: 3 }]), frame * 16);
      expect(coming(air).length).toBeLessThanOrEqual(TRAY_AIR.in);
    }
    expect(heard + settle(air).reduce((sum, landing) => sum + landing.medals, 0)).toBe(180);
    expect(TRAY_AIR.in).toBeGreaterThanOrEqual(TRAY_ARRIVAL.refill.medals);
    // Ten medals fed in one frame cannot happen, but would not fill the air either.
    expect(leaving(trayHappen(STILL_TRAY, news(40, [], new Array<1>(10).fill(1)), 0))).toHaveLength(TRAY_AIR.out);
  });
});

describe("the tray's medals", () => {
  it("are toned with the field's own washes", () => {
    expect(washed('#ffffff', [])).toBe('#ffffff');
    expect(washed('#000000', ['rgba(255, 255, 255, 0.5)'])).toBe('#808080');
    expect(washed('#ff0000', ['rgba(0, 0, 255, 0.25)', 'rgba(0, 0, 0, 0.5)'])).toBe('#600020');
    // Nickel under the lamps over the struck face is no brighter, and still a grey: no part of it far from another.
    const [red, green, blue] = [1, 3, 5].map((at) => parseInt(washed(MEDAL_PAINT.face, [FACES[0]]).slice(at, at + 2), 16));
    const struck = [1, 3, 5].map((at) => parseInt(MEDAL_PAINT.face.slice(at, at + 2), 16));
    expect(red).toBeLessThanOrEqual(struck[0]);
    expect(green).toBeLessThanOrEqual(struck[1]);
    expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThan(24);
    expect(() => washed('gold', [])).toThrow();
    expect(() => washed('#ffffff', ['brown'])).toThrow();
    for (const wash of FACES) expect(() => washed(MEDAL_PAINT.face, [wash])).not.toThrow();
  });
});
