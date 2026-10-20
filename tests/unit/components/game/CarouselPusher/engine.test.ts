import { describe, expect, it } from 'vitest';

import {
  AXIS,
  CAROUSEL,
  COS,
  DROP,
  FIELD,
  FIELD_MOST,
  HOLD_MAX,
  MEDAL_RADIUS,
  POCKET,
  POCKETS,
  PRESS_TO_DECK,
  REACH,
  RING,
  SIN,
  STOCK,
  TIMES,
  TURN_STEPS,
  WALLS,
  angleAt,
  atRest,
  busy,
  carouselCentre,
  copyMachine,
  deckToField,
  emptyMachine,
  feed,
  fieldToDeck,
  freshMachine,
  frontPays,
  idle,
  insideWalls,
  nextPocketUnderDrop,
  pocketAt,
  slideOf,
  step,
  type Machine,
  type MachineEvent,
} from '@/components/game/CarouselPusher/engine';
import { LOTTERY, OUTCOME_IDS, PATTERNS, PRIZES, STOPS, WEIGHTS, WEIGHT_TOTAL, classify, outcomeOf, spinFrom, ticketFor, trayValue } from '@/components/game/CarouselPusher/lottery';

// Cherry Blossom Carousel's machine: a carousel turning about a pole off its centre, pushing a field of medals, three
// holes on its deck, a counter and a treasure dish. Seeded and clockless: the same presses play out the same.

/** Runs the machine `steps` steps, gathering what it did. */
const run = (m: Machine, steps: number): MachineEvent[] => {
  const events: MachineEvent[] = [];
  for (let i = 0; i < steps; i++) step(m, LOTTERY, events);
  return events;
};
/** Steps until the press made now would bring a medal down on the deck as a hole passes under the drop spot. */
const toTheMoment = (m: Machine): void => {
  for (let i = 0; i < TURN_STEPS && nextPocketUnderDrop(m.step + PRESS_TO_DECK).steps !== 0; i++) step(m, LOTTERY);
};
/** A medal's room on the field: no two overlapping by more than this, nothing through a wall. */
const overlaps = (m: Machine, tolerance: number): number => {
  let worst = 0;
  for (let i = 0; i < m.ids.length; i++) {
    for (let j = i + 1; j < m.ids.length; j++) {
      const d = Math.hypot(m.xy[2 * i] - m.xy[2 * j], m.xy[2 * i + 1] - m.xy[2 * j + 1]);
      worst = Math.max(worst, 2 * MEDAL_RADIUS - d);
    }
  }
  return worst > tolerance ? worst : 0;
};

describe('the arithmetic every browser does alike', () => {
  it('has its own sines and cosines of whole degrees, to the last bit or two of the built-in ones', () => {
    for (let d = 0; d < 360; d++) {
      expect(Math.abs(COS[d] - Math.cos((d * Math.PI) / 180)), `cos ${d}`).toBeLessThan(1e-15);
      expect(Math.abs(SIN[d] - Math.sin((d * Math.PI) / 180)), `sin ${d}`).toBeLessThan(1e-15);
    }
    expect(COS[0]).toBe(1);
    expect(SIN[90]).toBe(1);
    expect(angleAt(-1)).toBe(359);
    expect(angleAt(TURN_STEPS * 3 + 7)).toBe(7);
  });

  it('puts a point on the deck and back where it was', () => {
    for (const s of [0, 37, 200, 359]) {
      const q = fieldToDeck(17.3, 9.1, s);
      const back = deckToField(q.qx, q.qy, s);
      expect(back.x).toBeCloseTo(17.3, 12);
      expect(back.y).toBeCloseTo(9.1, 12);
    }
  });
});

describe('the cabinet', () => {
  it('turns the carousel about the pole off its centre: its edge reaches no further than REACH, and the drop spot is always on its deck', () => {
    for (let s = 0; s < TURN_STEPS; s++) {
      const c = carouselCentre(s);
      expect(Math.hypot(c.x - AXIS.x, c.y - AXIS.y)).toBeCloseTo(CAROUSEL.offset, 12);
      expect(Math.hypot(DROP.x - c.x, DROP.y - c.y) + MEDAL_RADIUS).toBeLessThan(CAROUSEL.radius + 1e-9);
      // Every hole lies wholly on the deck, on its ring about the pole.
      for (let k = 0; k < POCKETS.length; k++) {
        const p = pocketAt(k, s);
        expect(Math.hypot(p.x - AXIS.x, p.y - AXIS.y)).toBeCloseTo(RING, 12);
        expect(Math.hypot(p.x - c.x, p.y - c.y) + POCKET.mouth).toBeLessThanOrEqual(CAROUSEL.radius + 1e-9);
      }
    }
    expect(REACH).toBe(CAROUSEL.radius + CAROUSEL.offset);
  });

  it('is a fan between two side walls that run out from the pole, a side hole at each front corner', () => {
    expect(FIELD.width).toBeCloseTo(2 * (FIELD.depth - AXIS.y) * Math.tan((FIELD.spread * Math.PI) / 180), 10);
    expect(insideWalls(AXIS.x, FIELD.depth - 1, MEDAL_RADIUS)).toBe(true);
    expect(insideWalls(0.5, AXIS.y + 3)).toBe(false);
    for (const wall of WALLS) expect(Math.hypot(wall.nx, wall.ny)).toBeCloseTo(1, 12);
    expect(frontPays(AXIS.x)).toBe(true);
    expect(frontPays(FIELD.sideReach - 0.01)).toBe(false);
    expect(frontPays(FIELD.width - FIELD.sideReach + 0.01)).toBe(false);
  });

  it('times a medal by the holes: three pass under the drop spot every turn, the next one counted to the step', () => {
    const at: number[] = [];
    for (let s = 0; s < TURN_STEPS; s++) if (nextPocketUnderDrop(s).steps === 0) at.push(s);
    expect(at).toHaveLength(3);
    for (const s of at) {
      const { pocket } = nextPocketUnderDrop(s);
      const p = pocketAt(pocket, s);
      expect(p.x).toBeCloseTo(DROP.x, 9);
      expect(p.y).toBeCloseTo(DROP.y, 9);
    }
    expect(PRESS_TO_DECK).toBe(TIMES.rail + TIMES.drop);
  });
});

describe('a medal on the deck', () => {
  it('goes down a hole it comes down in, rolls into one it slides out over, and otherwise slides off the edge', () => {
    // On a hole: in.
    const s = 0;
    const hole = pocketAt(0, s);
    expect(slideOf(hole.x, hole.y, s)).toMatchObject({ pocket: 0, direct: true });
    // Inside the ring, in line with a hole: rolls in.
    const inside = deckToField(0.5 * RING * COS[POCKETS[1]], 0.5 * RING * SIN[POCKETS[1]], s);
    expect(slideOf(inside.x, inside.y, s)).toMatchObject({ pocket: 1, direct: false });
    // Between holes, outside the ring: off the edge, on the rim.
    const between = deckToField(4.6 * COS[150], 4.6 * SIN[150], s);
    const off = slideOf(between.x, between.y, s);
    expect(off.pocket).toBe(-1);
    expect(Math.hypot(off.ex - CAROUSEL.offset, off.ey)).toBeCloseTo(CAROUSEL.radius, 9);
  });

  it('pressed at the moment, with no scatter, comes down in the hole that is under the drop spot', () => {
    const m = emptyMachine(1);
    toTheMoment(m);
    feed(m, 0, 0, ticketFor('miss'));
    const events = run(m, PRESS_TO_DECK + TIMES.pocket + 2);
    expect(events.find((e) => e.type === 'pocket')).toMatchObject({ direct: true, held: true });
    expect(events.find((e) => e.type === 'spin')).toBeTruthy();
  });

  it('pressed between holes, comes down on the deck, slides off and lands on the field', () => {
    const m = emptyMachine(2);
    toTheMoment(m);
    run(m, 60);
    feed(m, 0, 0, ticketFor('miss'));
    const events = run(m, PRESS_TO_DECK + 80);
    expect(events.some((e) => e.type === 'pocket')).toBe(false);
    const landed = events.find((e) => e.type === 'land');
    expect(landed).toBeTruthy();
    if (landed?.type === 'land') expect(insideWalls(landed.x, landed.y)).toBe(true);
  });

  it('takes a medal into the slot every quarter second at most, and waits its turn behind the others', () => {
    const m = emptyMachine(3);
    for (let i = 0; i < 3; i++) feed(m, 0.5, 0.5, 0.5);
    const rail = m.air.filter((a) => a.k === 'rail').map((a) => a.from);
    expect(rail).toEqual([0, TIMES.gap, 2 * TIMES.gap]);
    expect(m.slotAt).toBe(3 * TIMES.gap);
  });
});

describe('the counter', () => {
  it('draws every outcome from one number, by the weights, and shows digits that say it', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(WEIGHT_TOTAL);
    expect(PATTERNS.jackpot).toEqual([[7, 7, 7]]);
    expect(Object.values(PATTERNS).reduce((n, ways) => n + ways.length, 0)).toBe(1000);
    for (const id of OUTCOME_IDS) {
      for (let pattern = 0; pattern < PATTERNS[id].length; pattern += 7) {
        const drawn = outcomeOf(ticketFor(id, pattern));
        expect(OUTCOME_IDS[drawn.outcome]).toBe(id);
        expect(classify(...drawn.digits)).toBe(id);
      }
    }
    // The edges of each outcome's range.
    let from = 0;
    for (const id of OUTCOME_IDS) {
      expect(OUTCOME_IDS[outcomeOf(from / WEIGHT_TOTAL).outcome]).toBe(id);
      from += WEIGHTS[id];
      expect(OUTCOME_IDS[outcomeOf((from - 1e-9) / WEIGHT_TOTAL).outcome]).toBe(id);
    }
    expect(trayValue()).toBe((WEIGHTS.triple * PRIZES.triple + WEIGHTS.sevens * PRIZES.sevens + WEIGHTS.seven * PRIZES.seven) / WEIGHT_TOTAL);
  });

  it('stops left, middle, right, and rolls the right one on longer when the first two stop alike', () => {
    const plain = spinFrom(ticketFor('seven'), 100);
    expect(plain.stops).toEqual([STOPS.left, STOPS.middle, STOPS.right]);
    const reach = spinFrom(ticketFor('jackpot'), 100);
    expect(reach.stops).toEqual([STOPS.left, STOPS.middle, STOPS.reach]);
    expect(reach.at).toBe(100 + STOPS.reach + STOPS.jackpotAfter);
  });

  it('uses the numbers the presses kept, the first first, and pays a prize straight into the tray', () => {
    const m = emptyMachine(4);
    toTheMoment(m);
    feed(m, 0, 0, ticketFor('triple', 3));
    const events = run(m, PRESS_TO_DECK + TIMES.pocket + STOPS.reach + STOPS.after + 30);
    const spin = events.find((e) => e.type === 'spin');
    expect(spin?.type === 'spin' && OUTCOME_IDS[spin.spin.outcome]).toBe('triple');
    expect(events.find((e) => e.type === 'paid')).toMatchObject({ medals: PRIZES.triple });
    expect(m.tray).toBe(PRIZES.triple);
  });

  it('holds four spins at most: a medal into a hole while four wait starts nothing', () => {
    const m = emptyMachine(5);
    m.spin = spinFrom(ticketFor('miss'), m.step);
    m.holds = HOLD_MAX;
    toTheMoment(m);
    feed(m, 0, 0, 0.5);
    const events = run(m, PRESS_TO_DECK + TIMES.pocket + 1);
    expect(events.find((e) => e.type === 'pocket')).toMatchObject({ held: false });
    expect(m.holds).toBeLessThanOrEqual(HOLD_MAX);
  });
});

describe('the treasure dish', () => {
  it('grows a medal for every STOCK.every fed, and 7-7-7 throws all of it across the field and starts it again', () => {
    const m = freshMachine(6);
    const before = m.ids.length;
    toTheMoment(m);
    feed(m, 0, 0, ticketFor('jackpot'));
    for (let i = 1; i < STOCK.every; i++) feed(m, 0.25, 1, ticketFor('miss'));
    expect(m.stock).toBe(STOCK.start + 1);
    const events = run(m, 2_000);
    const jackpot = events.find((e) => e.type === 'jackpot');
    expect(jackpot).toMatchObject({ medals: STOCK.start + 1 });
    expect(m.stock).toBe(STOCK.start);
    // Every medal thrown came down somewhere: on the field, over the front into the tray, or behind a wall.
    expect(events.filter((e) => e.type === 'thrown')).toHaveLength(STOCK.start + 1);
    expect(m.ids.length).toBeGreaterThan(before);
  });

  it('never has more medals on the field and in the air than the field can hold: the stock waits in the dish, and all of it is thrown in the end', () => {
    const m = freshMachine(7);
    m.fling = 600;
    m.flingAt = m.step;
    let thrown = 0;
    for (let s = 0; s < 30_000 && (m.fling > 0 || m.air.length > 0); s++) {
      const events: MachineEvent[] = [];
      step(m, LOTTERY, events);
      thrown += events.filter((e) => e.type === 'thrown').length;
      expect(m.ids.length + m.air.length).toBeLessThanOrEqual(FIELD_MOST);
    }
    expect(thrown).toBe(600);
  }, 20_000);
});

describe('the field', () => {
  it('stands a fresh machine still, full and settled, the same for the same seed', () => {
    const a = freshMachine(11);
    const b = freshMachine(11);
    expect(a).toEqual(b);
    expect(atRest(a)).toBe(true);
    expect(a.ids.length).toBeGreaterThan(40);
    expect(overlaps(a, 1e-6)).toBe(0);
    for (let i = 0; i < a.ids.length; i++) expect(insideWalls(a.xy[2 * i], a.xy[2 * i + 1], MEDAL_RADIUS - 1e-6)).toBe(true);
  });

  it('turned unplayed at rest, nothing on it moves: turning it on without the steps is the same as working them out', () => {
    const played = freshMachine(12);
    for (let i = 0; i < 20; i++) {
      feed(played, (i * 0.37) % 1, (i * 0.61) % 1, 0.9);
      run(played, 40);
    }
    run(played, 6 * TURN_STEPS);
    for (let i = 0; i < 20 * TURN_STEPS && !atRest(played); i++) step(played, LOTTERY);
    expect(atRest(played)).toBe(true);
    const skipped = copyMachine(played);
    const worked = copyMachine(played);
    idle(skipped, 3 * TURN_STEPS + 17);
    const events = run(worked, 3 * TURN_STEPS + 17);
    expect(events.filter((e) => e.type !== 'stop')).toEqual([]);
    expect(skipped.step).toBe(worked.step);
    // To within a thousandth of a medal's radius: what is left of the medals' overlaps still eases apart, too little to see.
    for (let i = 0; i < worked.xy.length; i++) expect(Math.abs(worked.xy[i] - skipped.xy[i])).toBeLessThan(1e-3);
  });

  it('loses no medal and makes none: every medal fed or thrown is on the field, in the air, in the tray, down a hole or down a side hole', () => {
    const m = freshMachine(13);
    const start = m.ids.length;
    let fed = 0;
    const events: MachineEvent[] = [];
    for (let i = 0; i < 300; i++) {
      feed(m, (i * 0.618) % 1, (i * 0.414) % 1, (i * 0.271) % 1, events);
      fed += 1;
      for (let s = 0; s < 30; s++) step(m, LOTTERY, events);
    }
    for (let s = 0; s < 4_000 && busy(m); s++) step(m, LOTTERY, events);
    const count = (type: string) => events.reduce((n, e) => n + (e.type === type && 'count' in e ? e.count : 0), 0);
    const front = events.filter((e) => e.type === 'won').reduce((n, e) => n + (e.type === 'won' ? e.count : 0), 0);
    const pockets = events.filter((e) => e.type === 'pocket').length;
    const thrown = events.filter((e) => e.type === 'thrown').length;
    expect(start + fed + thrown).toBe(m.ids.length + m.air.length + front + count('lost') + pockets);
  }, 20_000);
});
