import { afterEach, describe, expect, it, vi } from 'vitest';

import { FIELD, MEDAL_RADIUS, MEDAL_THICKNESS, createMachine, frontPays, type Medal } from '@/components/game/MedalPusher/engine';
import { JEWEL_CUT } from '@/components/game/MedalPusher/jewel';
import { BALL_RADIUS, CHEEK_HAIR, EXIT, EXIT_TIME, GLOW_TIME, TABLE_WORDS, TRAY, TRAY_BULBS, ageStage, createStage, exitTime, railedJewel, trackMedals, type ExitingMedal, type Stage } from '@/components/game/MedalPusher/render';
import { advance, createSession, insert, type SessionEvent } from '@/components/game/MedalPusher/session';
import {
  HOLE_LEAN,
  RAIL_MIDDLE,
  RAIL_RIDE,
  SIDE_HOLE,
  SINK,
  SUNK_OFF,
  acrossAt,
  fromSide,
  holeAt,
  holeFloor,
  railSeat,
  railTime,
  railTop,
  railed,
  sinking,
} from '@/components/game/MedalPusher/sidehole';
import { CHUTE, VIEW, chuteHeight, project } from '@/components/game/MedalPusher/view';

const W = FIELD.width;
const D = FIELD.depth;
const R = MEDAL_RADIUS;
const T = MEDAL_THICKNESS;
const SIDES = [-1, 1] as const;

/** The stage makes its pictures on canvases: here it gets ones that draw nothing. */
function fakeDocument(): void {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the side holes at the front corners, as the cabinet has them', () => {
  it('has a mouth at each end of the front edge, as long as the engine says, and the tray between two cheeks', () => {
    expect(SIDE_HOLE.reach).toBe(FIELD.sideReach);
    // Wherever a medal goes over the front edge, the hole it goes down is the one the engine's rule loses it to.
    for (let x = 0; x <= W; x += 0.125) {
      expect(holeAt(x) === 0).toBe(frontPays(x));
      if (holeAt(x) !== 0) expect(holeAt(x)).toBe(x < W / 2 ? -1 : 1);
    }
    expect([holeAt(FIELD.sideReach - 1e-9), holeAt(FIELD.sideReach), holeAt(W - FIELD.sideReach), holeAt(W - FIELD.sideReach + 1e-9)]).toEqual([-1, 0, 0, 1]);
    // The cheeks stand on the rule's own lines, half to either side, and are narrow: a fifth of a medal.
    expect(TRAY).toEqual({ from: SIDE_HOLE.reach + SIDE_HOLE.cheek, to: W - SIDE_HOLE.reach - SIDE_HOLE.cheek });
    expect((TRAY.from + TRAY.to) / 2).toBe(W / 2);
    expect(SIDE_HOLE.cheek * 2).toBeLessThan(R / 2);
    for (const side of SIDES) {
      expect(fromSide(acrossAt(7, side), side)).toBeCloseTo(7, 12);
      expect(acrossAt(0, side)).toBe(side < 0 ? 0 : W);
    }
    // What is printed on the table says the same: GET before the tray and nowhere else, OUT before each mouth.
    for (const x of TABLE_WORDS.get) expect(x > TRAY.from + 7 && x < TRAY.to - 7).toBe(true);
    expect(TABLE_WORDS.out.some(([x, depth]) => x < SIDE_HOLE.reach - 5 && depth > 90)).toBe(true);
    // And the tray's bulbs are as far apart as they were when they ran the whole width: thirty in 96 units.
    expect((TRAY.to - TRAY.from - 2.6) / TRAY_BULBS).toBeCloseTo(96 / 30, 0);
  });

  it('is a mouth that reads on a phone: as wide as three medals and as tall as the picture has room for', () => {
    const PHONE = 345 / VIEW.width;
    const wide = (project(SIDE_HOLE.reach - SIDE_HOLE.cheek, 0, D).x - project(0, 0, D).x) * PHONE;
    expect(wide).toBeGreaterThan(60);
    // From the red edge down to the foot of the picture, which is where the cabinet's glass ends.
    const tall = (VIEW.height - project(0, 0, D).y) * PHONE;
    expect(tall).toBeGreaterThan(22);
    // The dark under the edge, before the chute begins, is a third of that; the chute has the rest.
    const dark = (project(0, holeFloor(0), D).y - project(0, 0, D).y) * PHONE;
    expect(dark).toBeGreaterThan(7);
    expect(dark).toBeLessThan(tall / 2);
    // The chute is drawn out past the foot of the picture, and so are the cheeks: nothing ends in sight.
    expect(project(10, holeFloor(SIDE_HOLE.past), D + SIDE_HOLE.past).y).toBeGreaterThan(VIEW.height);
    // Both bars of the ball rail are in the picture all the way across.
    for (const out of SIDE_HOLE.rails) {
      for (const across of [0, SIDE_HOLE.reach]) expect(project(across, railTop(across), D + out).y + SIDE_HOLE.bar * 6).toBeLessThan(VIEW.height);
    }
  });

  it('has a chute under the edge that falls away from the table, deeper than the open side’s', () => {
    expect(holeFloor(0)).toBe(-SIDE_HOLE.drop);
    expect(holeFloor(-3)).toBe(-SIDE_HOLE.drop);
    for (let out = 0; out < SIDE_HOLE.past; out += 0.5) expect(holeFloor(out + 0.5)).toBeLessThan(holeFloor(out));
    expect(HOLE_LEAN).toBeCloseTo(Math.atan(SIDE_HOLE.slope), 12);
    // It turns the corner from the side's chute a step down: the mouth is the darker and deeper of the two.
    expect(holeFloor(0)).toBeLessThan(chuteHeight(0));
    expect(SIDE_HOLE.slope).toBeGreaterThan(CHUTE.slope);
    // Its arrows are on the chute, inside the mouth, and point away from the table.
    expect(SIDE_HOLE.far).toBeGreaterThan(SIDE_HOLE.near);
    for (const mark of SIDE_HOLE.marks) {
      expect(mark - SIDE_HOLE.span / 2).toBeGreaterThan(0);
      expect(mark + SIDE_HOLE.span / 2).toBeLessThan(SIDE_HOLE.reach - SIDE_HOLE.cheek);
    }
  });

  it('has a ball rail a medal drops short of and a ball or a jewel cannot fall through', () => {
    const [first, second] = SIDE_HOLE.rails;
    // A medal whose middle is at the edge reaches half its width out: there is nothing under its nose.
    expect(first - SIDE_HOLE.bar / 2).toBeGreaterThan(R);
    // A ball that hangs over the edge is on the first bar before its middle is over.
    expect(first - SIDE_HOLE.bar / 2).toBeLessThan(BALL_RADIUS);
    // The two are closer together than a ball or a jewel is across, by a good deal, and each sits down between them.
    for (const radius of [BALL_RADIUS, JEWEL_CUT.girdle]) {
      expect(second - first).toBeLessThan(radius * 1.2);
      expect(railSeat(radius)).toBeGreaterThan(radius * 0.8);
      expect(railSeat(radius)).toBeLessThan(radius);
    }
    expect(RAIL_MIDDLE).toBe((first + second) / 2);
    // It is at the table's level or under it all the way, and leans toward the tray, where it ends over the cheek.
    expect(railTop(0)).toBeLessThanOrEqual(0);
    for (let across = 0; across < SIDE_HOLE.reach; across += 1) expect(railTop(across + 1)).toBeLessThan(railTop(across));
    expect(railTop(-5)).toBe(railTop(0));
    expect(railTop(SIDE_HOLE.reach + 5)).toBe(railTop(SIDE_HOLE.reach));
    // The chute is well under it: a medal lying along the chute passes below the bars.
    for (const out of SIDE_HOLE.rails) expect(holeFloor(out) + T + R * Math.sin(HOLE_LEAN)).toBeLessThan(railTop(SIDE_HOLE.reach) - SIDE_HOLE.bar - 1);
  });
});

describe('a medal that goes down a side hole’s mouth', () => {
  const AGES = Array.from({ length: Math.round(EXIT_TIME * 240) + 1 }, (_, i) => i / 240);
  const PLACES = [0.4, R, 6, 10, 15.9, 19.99];

  it('leaves the table where it lay, tips over the edge and slips off it, and never comes up again or goes through the table', () => {
    expect(SINK.gravity).toBe(EXIT.gravity);
    // It is carried on more slowly than one that sails into the tray: it drops in.
    expect(SINK.forward).toBeLessThan(EXIT.forward);
    // Its tail is off the edge when it has slipped half its own width, a fifth of a second after it went over.
    expect(SINK.forward * SUNK_OFF + SINK.slip * SUNK_OFF ** 2).toBeCloseTo(R, 9);
    expect(SUNK_OFF).toBeGreaterThan(0.12);
    expect(SUNK_OFF).toBeLessThan(0.25);
    // By then it is tipped as far as it tips, which is further than the chute lies.
    expect(SINK.tip).toBeLessThan(SUNK_OFF * SINK.turn);
    expect(SINK.tip).toBeGreaterThan(HOLE_LEAN);
    for (const side of SIDES) {
      for (const across of PLACES) {
        for (const y of [D - 0.4, D, D + 0.2]) {
          const x = acrossAt(across, side);
          const edge = Math.max(D, y);
          expect(sinking(x, y, side, 0, T)).toEqual({ x, height: T / 2, depth: edge, tilt: 0 });
          let last = sinking(x, y, side, 0, T);
          for (const age of AGES) {
            const at = sinking(x, y, side, age, T);
            expect(at.height).toBeLessThanOrEqual(last.height + 1e-12);
            expect(at.depth).toBeGreaterThanOrEqual(last.depth - 1e-12);
            // Its nose goes down while it hangs on the edge, and comes up to lie along the chute once it is off.
            if (age < SUNK_OFF) expect(at.tilt).toBeGreaterThanOrEqual(last.tilt);
            else expect(at.tilt).toBeLessThanOrEqual(last.tilt);
            expect(at.tilt).toBeLessThanOrEqual(SINK.tip);
            // It never leaves its own corner.
            expect(holeAt(at.x)).toBe(side);
            // No part of it is ever under the chute: its nose is its lowest point.
            expect(at.height - R * Math.sin(at.tilt)).toBeGreaterThan(holeFloor(at.depth - D + R * Math.cos(at.tilt)));
            // And its tail is never through the table: what of its under side is still behind the edge is at the table's level or over it.
            const tail = { depth: at.depth - (T / 2) * Math.sin(at.tilt) - R * Math.cos(at.tilt), height: at.height - (T / 2) * Math.cos(at.tilt) + R * Math.sin(at.tilt) };
            if (tail.depth < edge - 1e-9) expect(tail.height).toBeGreaterThanOrEqual(-1e-9);
            // While it hangs on the edge, the edge is under it: its under side is at the table's level there.
            if (age < SUNK_OFF) expect(at.height - (T / 2) * Math.cos(at.tilt) + Math.tan(at.tilt) * (at.depth - (T / 2) * Math.sin(at.tilt) - edge)).toBeCloseTo(0, 9);
            last = at;
          }
          // The moment its tail leaves the edge nothing jumps.
          const before = sinking(x, y, side, SUNK_OFF - 1e-6, T);
          const after = sinking(x, y, side, SUNK_OFF + 1e-6, T);
          expect(after.depth).toBeCloseTo(before.depth, 3);
          expect(after.height).toBeCloseTo(before.height, 3);
          expect(after.tilt).toBeCloseTo(before.tilt, 3);
        }
      }
    }
  });

  it('drops between the edge and the first bar and goes away under the rail, touching neither bar', () => {
    // The medal as a disc tipped nose down: at a place out from the edge that it covers, how high its upper face is.
    const upper = (at: ReturnType<typeof sinking>, out: number): number | null => {
      const from = at.depth - D;
      const reach = R * Math.cos(at.tilt);
      if (out < from - reach || out > from + reach) return null;
      return at.height + T / 2 - Math.tan(at.tilt) * (out - from);
    };
    for (const side of SIDES) {
      for (const across of PLACES) {
        for (const age of AGES) {
          const at = sinking(acrossAt(across, side), D, side, age, T);
          // The bars are lowest at the cheek: it clears them there, so it clears them anywhere.
          const under = railTop(SIDE_HOLE.reach) - SIDE_HOLE.bar;
          for (const out of SIDE_HOLE.rails) {
            for (const edge of [out - SIDE_HOLE.bar / 2, out, out + SIDE_HOLE.bar / 2]) {
              const top = upper(at, edge);
              if (top !== null) expect(top).toBeLessThan(under - 0.5);
            }
          }
        }
      }
    }
    // While it hangs on the edge its nose is short of the first bar: it goes down between the edge and the bar.
    for (const age of AGES.filter((time) => time < SUNK_OFF)) {
      const at = sinking(10, D, -1, age, T);
      expect(at.depth - D + R * Math.cos(at.tilt)).toBeLessThan(SIDE_HOLE.rails[0] - SIDE_HOLE.bar / 2 - 0.1);
    }
    // A tenth of a second after its tail is off it is down on the chute, lying along it.
    const landed = sinking(10, D, -1, SUNK_OFF + SINK.settle, T);
    expect(landed.tilt).toBeCloseTo(HOLE_LEAN, 12);
    expect(landed.height).toBeCloseTo(holeFloor(landed.depth - D) + T / 2 + 0.05, 9);
    // By the time it has gone dark it is past both bars, under them; and it is quicker down the chute than it was carried over the edge.
    const dark = sinking(10, D, -1, EXIT_TIME * 0.7, T);
    expect(dark.depth - D).toBeGreaterThan(SIDE_HOLE.rails[1] + SIDE_HOLE.bar / 2);
    const pace = (age: number) => (sinking(10, D, -1, age + 0.01, T).depth - sinking(10, D, -1, age, T).depth) / 0.01;
    expect(pace(0.3)).toBeGreaterThan(SINK.forward * 2);
  });

  it('comes off the cheek into the mouth when it went over beside it: the whole of it goes down the hole', () => {
    for (const side of SIDES) {
      const beside = acrossAt(SIDE_HOLE.reach - 0.05, side);
      // As it goes over it is where it lay, half of it over the cheek.
      expect(sinking(beside, D, side, 0, T).x).toBe(beside);
      // By the time it is below the edge all of it is inside the mouth, clear of the cheek.
      for (const age of AGES.filter((time) => time >= SINK.aside)) {
        const at = sinking(beside, D, side, age, T);
        expect(fromSide(at.x, side) + R).toBeLessThanOrEqual(SIDE_HOLE.reach - SIDE_HOLE.cheek + 1e-9);
      }
      expect(sinking(beside, D, side, SINK.aside, T).height + T / 2).toBeLessThan(0);
      // One that went over in the middle of the mouth does not move across at all.
      for (const age of AGES) expect(sinking(acrossAt(10, side), D, side, age, T).x).toBe(acrossAt(10, side));
    }
  });
});

describe('a ball or a jewel that crosses a side hole’s mouth', () => {
  const ROUND = [BALL_RADIUS, JEWEL_CUT.girdle];
  const PLACES = [0.5, 4.5, 10, 16, 19.9];

  it('comes down off the edge on to the rail, rolls along it to the tray and only there drops in', () => {
    for (const side of SIDES) {
      for (const radius of ROUND) {
        for (const across of PLACES) {
          const x = acrossAt(across, side);
          const life = railTime(across, radius);
          // It starts standing on the table, where it was.
          expect(railed(x, D, side, 0, radius)).toEqual({ x, height: radius, depth: D, rolled: 0, over: false });
          let last = railed(x, D, side, 0, radius);
          let dropped = -1;
          for (let age = 0; age <= life + 1e-9; age += 1 / 240) {
            const at = railed(x, D, side, age, radius);
            // It only ever goes toward the tray, and stays where the rail is.
            expect(fromSide(at.x, side)).toBeGreaterThanOrEqual(fromSide(last.x, side) - 1e-12);
            expect(at.depth).toBeGreaterThanOrEqual(D);
            expect(at.depth).toBeLessThanOrEqual(D + RAIL_MIDDLE + 1e-12);
            if (!at.over) {
              // On the rail it is never lower than it sits between the bars there: it does not go into the mouth.
              expect(at.height).toBeGreaterThanOrEqual(railTop(fromSide(at.x, side)) + railSeat(radius) - 1e-9);
              expect(at.height - radius).toBeGreaterThan(holeFloor(at.depth - D) + 2);
              expect(dropped).toBe(-1);
            } else if (dropped < 0) {
              dropped = age;
              // When it drops, the whole of it is past the cheek, over the tray.
              expect(fromSide(at.x, side) - radius).toBeGreaterThanOrEqual(SIDE_HOLE.reach + SIDE_HOLE.cheek - 1e-9);
            }
            last = at;
          }
          // It has settled between the bars soon after it went over, and it does drop before it is taken out of the picture.
          const settled = railed(x, D, side, RAIL_RIDE.settle, radius);
          if (!settled.over) expect(settled.depth).toBeCloseTo(D + RAIL_MIDDLE, 9);
          expect(dropped).toBeGreaterThan(0);
          // By then it is out of sight under the edge.
          expect(railed(x, D, side, life, radius).height + radius).toBeLessThan(0);
        }
      }
    }
  });

  it('takes longer the nearer the side it went over, and never long', () => {
    for (const radius of ROUND) {
      for (let across = 0; across < SIDE_HOLE.reach; across += 2) expect(railTime(across + 2, radius)).toBeLessThan(railTime(across, radius));
      expect(railTime(0, radius)).toBeLessThan(1.2);
      expect(railTime(SIDE_HOLE.reach, radius)).toBeGreaterThan(RAIL_RIDE.gone);
    }
    // It gathers pace: it covers more of the rail in each tenth of a second than in the one before.
    const gone = (age: number) => railed(2, D, -1, age, BALL_RADIUS).rolled;
    expect(gone(0.5) - gone(0.4)).toBeGreaterThan(gone(0.4) - gone(0.3));
    expect(gone(0.4) - gone(0.3)).toBeGreaterThan(gone(0.3) - gone(0.2));
  });

  it('with motion reduced crosses the bars the way it was going, without the roll along them, and still does not go in', () => {
    for (const side of SIDES) {
      for (const radius of ROUND) {
        for (const across of PLACES) {
          const x = acrossAt(across, side);
          const life = railTime(across, radius, true);
          // As long whichever place it went over, and no longer than a medal's own way out by much.
          expect(life).toBe(RAIL_RIDE.settle + RAIL_RIDE.gone);
          expect(life).toBeLessThan(EXIT_TIME);
          for (let age = 0; age <= life + 1e-9; age += 1 / 120) {
            const at = railed(x, D, side, age, radius, true);
            expect(at.x).toBe(x);
            expect(at.over).toBe(false);
            expect(at.depth).toBeCloseTo(D + RAIL_RIDE.over * age, 9);
            expect(at.height).toBeGreaterThanOrEqual(railTop(across) + railSeat(radius) - 1e-9);
          }
        }
      }
    }
  });

  it('shows a jewel on the rail as the stone it is, rolling about its girdle', () => {
    const exit: ExitingMedal = { id: 9, x: 6, y: D + 0.1, kind: 'won', side: -1, ball: false, jewel: true, corner: true, age: 0.3 };
    const spot = railedJewel(exit);
    const at = railed(6, D + 0.1, -1, 0.3, JEWEL_CUT.girdle);
    expect(spot).toMatchObject({ id: 9, x: at.x, height: at.height, depth: at.depth, light: 1 });
    // It turns as far as it has rolled, about an axis that points out from the table: it rolls along the rail.
    expect(spot.tilt).toBeCloseTo(0.1 + at.rolled / JEWEL_CUT.girdle, 12);
    expect(spot.heading).toBe(-Math.PI / 2);
    expect(railedJewel({ ...exit, side: 1, x: W - 6 }).heading).toBe(Math.PI / 2);
    // With motion reduced it crosses the bars and does not roll along them.
    const calm = railedJewel(exit, true);
    expect(calm.x).toBe(6);
    expect(calm.heading).toBe(0);
  });
});

describe('what the stage shows of a medal that has left the field', () => {
  const lying = (id: number, x: number, y: number, more: Partial<Medal> = {}): Medal => ({ id, x, y, level: 0, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1, ...more });
  /** A stage that saw these medals on the table and then saw them gone, told that the machine counted `won` of them. */
  const gone = (medals: Medal[], won?: number): Stage => {
    const stage = createStage(1, false);
    const machine = createMachine(3);
    machine.medals = medals;
    trackMedals(stage, machine, 0);
    machine.medals = [];
    trackMedals(stage, machine, won);
    return stage;
  };

  it('shows a medal that went over a front corner going down the side hole there, and never into the tray', () => {
    fakeDocument();
    for (const x of [1, 3.2, 10, 19.9, 80.1, 90, 99]) {
      const side = x < 50 ? -1 : 1;
      const stage = gone([lying(4, x, D - 0.1)]);
      expect(stage.exits).toEqual([{ id: 4, x, y: D - 0.1, kind: 'lost', side, ball: false, corner: true, age: 0 }]);
      // The hole's own light, on its side only; nothing of the tray's, and no glint.
      expect(stage.sideGlow).toEqual(side < 0 ? [GLOW_TIME, 0] : [0, GLOW_TIME]);
      expect(stage.trayGlow).toBe(0);
      expect(stage.sparks).toEqual([]);
      expect(stage.tally).toBe(0);
    }
    // Over the middle of the edge it is won as it always was, to the rule's own lines.
    for (const x of [FIELD.sideReach, 35, 50, 65, W - FIELD.sideReach]) {
      const stage = gone([lying(4, x, D - 0.1)]);
      expect(stage.exits).toEqual([{ id: 4, x, y: D - 0.1, kind: 'won', side: x < 50 ? -1 : 1, ball: false, age: 0 }]);
      expect(stage.sideGlow).toEqual([0, 0]);
      expect(stage.trayGlow).toBe(GLOW_TIME);
      expect(stage.sparks).toHaveLength(2);
    }
    // And one pushed off an open side is lost down the side's chute, not the mouth.
    const side = gone([lying(4, 0.3, 90)]);
    expect(side.exits).toEqual([{ id: 4, x: 0.3, y: 90, kind: 'lost', side: -1, ball: false, age: 0 }]);
    expect(side.sideGlow).toEqual([GLOW_TIME, 0]);
  });

  it('shows as many medals going into the tray as the machine has just counted, and floats that count up', () => {
    fakeDocument();
    const kinds = (stage: Stage) => stage.exits.map((exit) => `${exit.kind}${exit.corner ? ' corner' : ''}`);
    // The stage last saw it a hair inside the tray's stretch and the machine counted nothing: it went over beside the cheek, on the hole's side.
    expect(kinds(gone([lying(1, FIELD.sideReach + 0.3, D - 0.1)], 0))).toEqual(['lost corner']);
    // And the other way: last seen a hair inside the hole's reach, and the machine counted it.
    const counted = gone([lying(1, FIELD.sideReach - 0.2, D - 0.1)], 1);
    expect(kinds(counted)).toEqual(['won']);
    expect(counted.tally).toBe(1);
    expect(counted.trayGlow).toBe(GLOW_TIME);
    expect(counted.sideGlow).toEqual([0, 0]);
    // Of two beside a cheek with one counted, the nearer the cheek is the one that went the other side of it.
    expect(kinds(gone([lying(1, W - FIELD.sideReach - 0.6, D - 0.1), lying(2, W - FIELD.sideReach - 0.2, D - 0.1)], 1))).toEqual(['won', 'lost corner']);
    // No medal further from a cheek than a hair is ever told otherwise, whatever the count: a count the stage cannot
    // account for (a frame it did not see) changes nothing it shows.
    expect(CHEEK_HAIR).toBeLessThan(R);
    expect(kinds(gone([lying(1, FIELD.sideReach + CHEEK_HAIR + 0.01, D - 0.1), lying(2, 50, D - 0.1)], 0))).toEqual(['won', 'won']);
    expect(kinds(gone([lying(1, FIELD.sideReach - CHEEK_HAIR - 0.01, D - 0.1), lying(2, 5, D - 0.1)], 2))).toEqual(['lost corner', 'lost corner']);
    // A ball or a jewel is not one of the medals counted: it is collected whatever the count is.
    expect(kinds(gone([lying(1, 50, D - 0.1, { ball: true }), lying(2, FIELD.sideReach + 0.3, D - 0.1)], 0))).toEqual(['won', 'lost corner']);
    // Told nothing, the stage goes by where each medal was last seen.
    expect(kinds(gone([lying(1, FIELD.sideReach + 0.3, D - 0.1), lying(2, FIELD.sideReach - 0.2, D - 0.1)]))).toEqual(['won', 'lost corner']);
  });

  it('shows every medal a played machine wins and loses as the machine counted it, frame by frame', () => {
    fakeDocument();
    const session = createSession(11, { quickPick: true });
    session.credits = 100000;
    const stage = createStage(1, false);
    const shown = { won: 0, lost: 0, corner: 0, side: 0 };
    let won = 0;
    let lost = 0;
    trackMedals(stage, session.machine, 0);
    // Twenty-four seconds of both rails fed: about ninety medals won, thirty-five down the mouths and as many off the sides.
    for (let frame = 0; frame < 60 * 24; frame++) {
      if (frame % 6 === 0) insert(session, 0);
      if (frame % 6 === 3) insert(session, 1);
      const events: SessionEvent[] = [];
      advance(session, 1 / 60, events);
      let counted = 0;
      for (const event of events) {
        if (event.type === 'won') counted += event.count;
        if (event.type === 'lost') lost += event.count;
      }
      won += counted;
      const before = new Set(stage.exits);
      trackMedals(stage, session.machine, counted);
      const fresh = stage.exits.filter((exit) => !before.has(exit) && !exit.ball && !exit.jewel);
      // In every frame, not only in the end: the medals shown going into the tray are the medals counted.
      expect(fresh.filter((exit) => exit.kind === 'won')).toHaveLength(counted);
      for (const exit of fresh) {
        if (exit.kind === 'won') shown.won++;
        else shown.lost++;
        if (exit.kind === 'lost') shown[exit.corner ? 'corner' : 'side']++;
        // A medal shown won is never shown at a corner, and one shown lost over the front always is.
        if (exit.kind === 'won') expect(exit.corner).toBeUndefined();
      }
      ageStage(stage, 1 / 60);
    }
    expect(shown.won).toBe(won);
    expect(shown.lost).toBe(lost);
    expect(won).toBe(session.won);
    expect(lost).toBe(session.lost);
    // It was a real game: medals were won, and lost both ways.
    expect(shown.won).toBeGreaterThan(40);
    expect(shown.corner).toBeGreaterThan(10);
    expect(shown.side).toBeGreaterThan(3);
  });

  it('collects a ball or a jewel that goes over a corner, and keeps it in the picture until it has rolled to the tray', () => {
    fakeDocument();
    for (const prize of [{ ball: true }, { jewel: true }] as const) {
      const radius = 'ball' in prize ? BALL_RADIUS : JEWEL_CUT.girdle;
      const stage = gone([lying(6, 4, D - 0.1, prize)], 0);
      expect(stage.exits).toEqual([{ id: 6, x: 4, y: D - 0.1, kind: 'won', side: -1, ball: 'ball' in prize, ...('jewel' in prize ? { jewel: true } : {}), corner: true, age: 0 }]);
      // It is the player's: the tray lights and the hole does not.
      expect(stage.trayGlow).toBe(GLOW_TIME);
      expect(stage.sideGlow).toEqual([0, 0]);
      expect(stage.sparks).toHaveLength(14);
      const life = exitTime(stage.exits[0]);
      expect(life).toBe(railTime(4, radius));
      expect(life).toBeGreaterThan(EXIT_TIME);
      // It is still there when a medal would be gone, and gone once it has had its roll.
      ageStage(stage, EXIT_TIME + 0.01);
      expect(stage.exits).toHaveLength(1);
      ageStage(stage, life - EXIT_TIME);
      expect(stage.exits).toEqual([]);
      // With motion reduced it has no roll, and is gone as soon as a medal is.
      const calm = gone([lying(6, 4, D - 0.1, prize)], 0);
      expect(exitTime(calm.exits[0], true)).toBe(EXIT_TIME);
      ageStage(calm, EXIT_TIME + 0.01, true);
      expect(calm.exits).toEqual([]);
      // Over the tray it is as it was: no rail, and a medal's moment.
      const tray = gone([lying(6, 50, D - 0.1, prize)], 0);
      expect(tray.exits[0]).not.toHaveProperty('corner');
      expect(exitTime(tray.exits[0])).toBe(EXIT_TIME);
    }
    // A medal that goes down a mouth has a medal's moment too.
    expect(exitTime({ id: 1, x: 5, y: D, kind: 'lost', side: -1, ball: false, corner: true, age: 0 })).toBe(EXIT_TIME);
  });
});
