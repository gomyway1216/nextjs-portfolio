import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, HATCH, PAYOUT_SLOT, SLOT, airSpot, armCollar, armGoal, armStart, armTip, railFrame, rollingSpot, slotSpot, type Spot } from '@/components/game/MedalPusher/arms';
import { SHELF_SHARE, reliefHeight, reliefMap } from '@/components/game/MedalPusher/art3d';
import { APRON, CATCHER, SLOPE, START_SLOT, caught, clearOfFoot, lampSpot, litSlots, mouthSpot, mouthSpots, rolling, slotHalf, underCatcher, wingCorners } from '@/components/game/MedalPusher/catcher';
import { CHUCKERS } from '@/components/game/MedalPusher/chuckers';
import {
  FLAT_STRIDE,
  Flat,
  LAMP_ROWS,
  MATERIAL,
  MOVING_CAST,
  MOVING_HOOD,
  MOVING_PARTS,
  SHAPE,
  SOLID_STRIDE,
  STUDS,
  Solid,
  THROAT_FILL,
  addCatcherLamps,
  buildCabinet,
  buildLamps,
  buildMoving,
  buildTouches,
  light,
} from '@/components/game/MedalPusher/cabinet3d';
import {
  CHECKERS,
  FALL_TIME,
  FEED,
  FIELD,
  LUCKY,
  MEDAL_RADIUS,
  MEDAL_THICKNESS,
  PUSHER,
  RELEASE,
  ROLL_TIME,
  SETTLE,
  TOWER,
  buildTowers,
  createMachine,
  dropBall,
  dropJewel,
  luckySlot,
  pusherFront,
  step,
  type Machine,
  type Medal,
} from '@/components/game/MedalPusher/engine';
import { JEWEL_CUT, JEWEL_FACETS, JEWEL_LAMPS, JEWEL_SHOW, collectedJewel, fallingJewel, jewelLampX, lyingJewel } from '@/components/game/MedalPusher/jewel';
import { attitude, rotate, transform } from '@/components/game/MedalPusher/mat4';
import {
  BALL_RADIUS,
  CHUTE_LEAN,
  EXIT_TIME,
  GLASS,
  GOLD_FLASH,
  LIP_FALL,
  REST_LIGHT,
  SLOT_LIGHT,
  SLOT_SHAPE,
  ageStage,
  createStage,
  glassShift,
  goldFlash,
  lightGate,
  showJewel,
  trackMedals,
  type DrawOptions,
  type ExitingMedal,
  type Stage,
} from '@/components/game/MedalPusher/render';
import { createScene3d } from '@/components/game/MedalPusher/render3d';
import * as shaders from '@/components/game/MedalPusher/shaders3d';
import { WASH_OVER_3D, askedFor, createRenderer, sceneContext } from '@/components/game/MedalPusher/renderer';
import {
  BEAD,
  BEAD_STRIDE,
  EYE,
  KEY_LIGHT,
  LANDED,
  LEAN,
  MEDAL_STRIDE,
  armTipAt,
  ballShape,
  cameraMatrix,
  chance,
  createRows,
  jewelShape,
  lightMatrix,
  medalShape,
  writeBalls,
  writeJewels,
  writeMedals,
  type Rows,
  type Shape,
} from '@/components/game/MedalPusher/scene3d';
import { CHUTE, HEIGHT, HOLD_LAMPS, HOUSING, SCREEN, UPPER, VIEW, chuteHeight, project, unproject, unprojectPanel } from '@/components/game/MedalPusher/view';

import { aimBoth, aimSide, dropAt } from './feeding';

const P = HEIGHT.pusher;
const T = MEDAL_THICKNESS;
const R = MEDAL_RADIUS;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Where the matrix puts a point of the cabinet, in pixels of the drawing, and how deep. */
function seen(matrix: Float32Array, x: number, height: number, depth: number) {
  const [cx, cy, cz, cw] = transform([0, 0, 0, 0], matrix, x, height, depth);
  return { x: ((cx / cw + 1) / 2) * VIEW.width, y: ((1 - cy / cw) / 2) * VIEW.height, z: cz / cw, w: cw };
}

describe('the camera of the 3D field', () => {
  const camera = cameraMatrix(new Float32Array(16));

  it('puts every point of the cabinet on the pixel the 2D camera puts it on', () => {
    let worst = 0;
    let points = 0;
    for (let x = -30; x <= 130; x += 10) {
      for (let height = -30; height <= 44; height += 3.7) {
        for (let depth = -2; depth <= 112; depth += 6) {
          const want = project(x, height, depth);
          const got = seen(camera, x, height, depth);
          worst = Math.max(worst, Math.abs(got.x - want.x), Math.abs(got.y - want.y));
          points++;
        }
      }
    }
    expect(points).toBeGreaterThan(5000);
    // Far less than a pixel, on a drawing 640 across: the matrix is kept in single precision.
    expect(worst).toBeLessThan(0.005);
  });

  it('is the camera the field always had: the drawing only grew upward, to take in the wall with the screen in it', () => {
    // The camera as it was when the drawing was 540 high and ended at the top of the field's back panel.
    const old = (x: number, height: number, depth: number) => {
      const reach = Math.hypot(150, 215 - 52);
      const forward = { y: -150 / reach, z: (52 - 215) / reach };
      const distance = (height - 150) * forward.y + (depth - 215) * forward.z;
      const scale = 1095 / distance;
      return { x: 320 + (x - 50) * scale, y: 306 - ((height - 150) * -forward.z + (depth - 215) * forward.y) * scale, scale };
    };
    expect(VIEW.width).toBe(640);
    expect(VIEW.height).toBe(540 + UPPER);
    expect(UPPER).toBeGreaterThan(250);
    for (let x = -10; x <= 110; x += 15) {
      for (const height of [-18, 0, HEIGHT.pusher, 20, 40]) {
        for (let depth = 0; depth <= 100; depth += 12.5) {
          const now = project(x, height, depth);
          const then = old(x, height, depth);
          // As far from either side as it was, and as far from the bottom edge: the picture grew at the top only.
          expect(now.x).toBeCloseTo(then.x, 9);
          expect(VIEW.height - now.y).toBeCloseTo(540 - then.y, 9);
          expect(now.scale).toBeCloseTo(then.scale, 12);
        }
      }
    }
    // A pixel still means the point it shows: on the pusher, on the wall under the screen, and now on the screen itself.
    for (const [x, depth] of [
      [20, 80],
      [77, 12],
      [50, 50],
    ]) {
      const at = project(x, HEIGHT.pusher, depth);
      const back = unproject(at.x, at.y, HEIGHT.pusher);
      expect(back?.x).toBeCloseTo(x, 6);
      expect(back?.depth).toBeCloseTo(depth, 6);
    }
    for (const [x, height] of [
      [31, 18],
      [5, 80],
      [96, 70],
      [50, SCREEN.top],
    ]) {
      const at = project(x, height, 0);
      const panel = unprojectPanel(at.x, at.y);
      expect(panel?.x).toBeCloseTo(x, 6);
      expect(panel?.height).toBeCloseTo(height, 6);
    }
    // The picture goes up as far as the hood: the top edge of the hood's face is on it, a few pixels down, and the
    // wall behind the hood only just off it. And the screen reaches down into what was the top of the old picture.
    expect(project(50, HEIGHT.top, HOUSING.out).y).toBeGreaterThan(0);
    expect(project(50, HEIGHT.top, HOUSING.out).y).toBeLessThan(12);
    expect(project(50, HEIGHT.top, 0).y).toBeGreaterThan(-12);
    expect(project(50, SCREEN.foot, 0).y).toBeGreaterThan(UPPER);
  });

  it('keeps the whole cabinet between its near and far planes, the nearer the smaller', () => {
    for (const [x, height, depth] of [
      [50, 0, 0],
      [0, HEIGHT.top, 0],
      [-34, -12, 0],
      [50, 0, FIELD.depth],
      [50, -40, FIELD.depth + 12],
      [50, HEIGHT.top, HOUSING.out],
      // A medal shown to a slot is the nearest thing there is.
      [ARMS.collar.inset, ARMS.collar.height + R, ARMS.collar.depth + SLOT.out + R],
      [FIELD.width - ARMS.collar.inset, ARMS.collar.height - R, ARMS.collar.depth + SLOT.out + R],
      [50, 62, 40],
    ]) {
      const point = seen(camera, x, height, depth);
      expect(point.w).toBeGreaterThan(0);
      expect(point.z).toBeGreaterThan(-1);
      expect(point.z).toBeLessThan(1);
    }
    // Along one line of sight, what is further from the camera is deeper.
    const near = seen(camera, 50, 0, 90);
    const far = seen(camera, 50, 0, 10);
    expect(far.z).toBeGreaterThan(near.z);
    expect(seen(camera, 20, 30, 0).z).toBeGreaterThan(seen(camera, 20, 30, 40).z);
  });

  it('stands where the 2D camera stands', () => {
    // Every pixel's line of sight goes through the camera: two points one pixel shows, and the eye, lie on a line.
    for (const [px, py] of [
      [100, 120 + UPPER],
      [320, 300 + UPPER],
      [600, 500 + UPPER],
    ]) {
      const a = unproject(px, py, 0);
      const b = unproject(px, py, 30);
      if (!a || !b) throw new Error('the pixel shows no table');
      const t = (EYE[1] - 0) / 30;
      expect(a.x + (b.x - a.x) * t).toBeCloseTo(EYE[0], 6);
      expect(a.depth + (b.depth - a.depth) * t).toBeCloseTo(EYE[2], 6);
    }
    expect(EYE[0]).toBeCloseTo(FIELD.width / 2, 9);
    expect(EYE[1]).toBeGreaterThan(HEIGHT.top);
    expect(EYE[2]).toBeGreaterThan(ARMS.collar.depth);
  });

  it('shakes the picture sideways by whole pixels of the drawing', () => {
    const shaken = cameraMatrix(new Float32Array(16), 2.2);
    for (const [x, height, depth] of [
      [10, 0, 80],
      [70, P, 12],
      [50, 30, 0],
    ]) {
      const still = seen(camera, x, height, depth);
      const moved = seen(shaken, x, height, depth);
      expect(moved.x - still.x).toBeCloseTo(2.2, 3);
      expect(moved.y).toBeCloseTo(still.y, 3);
    }
  });
});

describe('the key light', () => {
  const sun = lightMatrix(new Float32Array(16));
  const lit = (x: number, y: number, z: number) => transform([0, 0, 0, 0], sun, x, y, z);

  it('comes from above, behind the field and a little to the left', () => {
    expect(Math.hypot(...KEY_LIGHT)).toBeCloseTo(1, 9);
    expect(KEY_LIGHT[1]).toBeGreaterThan(0.7);
    // From behind: a shadow falls toward the player, where it is seen, and the pusher shades the table under its lip.
    expect(KEY_LIGHT[2]).toBeLessThan(0);
    expect(KEY_LIGHT[0]).toBeLessThan(0);
  });

  it('sees both tables, everything that can stand on them, and the feed arms over them out to their slots', () => {
    for (const x of [0, 50, FIELD.width]) {
      for (const y of [0, P, P + TOWER.max * T, ARMS.collar.height + SLOT.ring]) {
        for (const z of [0, 40, FIELD.depth, ARMS.collar.depth + SLOT.out]) {
          const [cx, cy, cz, cw] = lit(x, y, z);
          expect(cw).toBe(1);
          for (const value of [cx, cy, cz]) {
            expect(value).toBeGreaterThan(-1);
            expect(value).toBeLessThan(1);
          }
        }
      }
    }
  });

  it('looks straight down its own rays', () => {
    // Two points on one ray of the lamp fall on the same texel of the shadow map, the upper one nearer.
    const low = lit(40, 0, 60);
    const high = lit(40 + KEY_LIGHT[0] * 10, KEY_LIGHT[1] * 10, 60 + KEY_LIGHT[2] * 10);
    expect(high[0]).toBeCloseTo(low[0], 5);
    expect(high[1]).toBeCloseTo(low[1], 5);
    expect(high[2]).toBeLessThan(low[2]);
  });
});

/** The rows of medals for a machine, read back as objects. */
function medalRows(machine: Machine, exits: ExitingMedal[] = []) {
  const rows = createRows(MEDAL_STRIDE, 64);
  writeMedals(rows, machine, exits);
  return readMedals(rows);
}

function readMedals(rows: Rows) {
  return Array.from({ length: rows.count }, (_, index) => {
    const at = index * MEDAL_STRIDE;
    const d = rows.data;
    return { x: d[at], y: d[at + 1], z: d[at + 2], own: d[at + 3], up: rotate(d, at + 4, [0, 1, 0]), turn: [d[at + 4], d[at + 5], d[at + 6], d[at + 7]], ground: d[at + 8], contact: d[at + 9], light: d[at + 10] };
  });
}

const lying = (id: number, x: number, y: number, level: 0 | 1, tier: 0 | 1 = 0, more: Partial<Medal> = {}): Medal => ({ id, x, y, level, tier, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1, ...more });

/** A machine holding just these medals. */
const holding = (medals: Medal[]): Machine => ({ ...createMachine(1), medals, falling: [] });

describe('the medals of the 3D field', () => {
  it('writes one row for every medal of a new machine, each where the engine has it', () => {
    const machine = createMachine(7, 2);
    const rows = medalRows(machine);
    const medals = machine.medals.filter((medal) => !medal.ball);
    expect(rows).toHaveLength(medals.length);
    expect(rows.length).toBeGreaterThan(200);
    rows.forEach((row, index) => {
      const medal = medals[index];
      expect(row.x).toBeCloseTo(medal.x, 4);
      expect(row.z).toBeCloseTo(medal.y, 4);
      // Its middle is half a thickness above what it lies on: the table, the pusher, or the medals of the lower
      // tier. One on other medals leans on their edges, which holds it up by a hair more.
      const ground = (medal.level === 1 ? P : 0) + (medal.tier === 1 ? T : 0);
      if (medal.tier === 0) expect(row.y).toBeCloseTo(ground + T / 2, 4);
      else expect(row.y - ground - T / 2).toBeCloseTo(R * Math.sqrt(1 - row.up[1] ** 2), 4);
      expect(row.ground).toBeCloseTo(ground, 4);
      expect(row.contact).toBe(1);
      expect(row.light).toBe(1);
      // It lies nearly level, but never quite, and its attitude is a rotation and nothing more.
      expect(Math.hypot(...row.turn)).toBeCloseTo(1, 5);
      const lean = Math.acos(Math.min(1, row.up[1]));
      const range = medal.tier === 1 ? LEAN.pile : LEAN.table;
      expect(lean).toBeGreaterThan(range.least - 1e-4);
      expect(lean).toBeLessThan(range.most + 1e-4);
    });
  });

  it('leans every lying medal its own way, a degree or two on the table and more on other medals', () => {
    // On the table: between two thirds of a degree and three. On other medals: three degrees to seven and a half.
    expect(LEAN.table.least).toBeGreaterThan(0.01);
    expect(LEAN.table.most).toBeLessThan(0.055);
    expect(LEAN.pile.least).toBeGreaterThanOrEqual(LEAN.table.most);
    expect(LEAN.pile.most).toBeLessThan(0.14);
    const medals = Array.from({ length: 60 }, (_, i) => lying(i + 1, 5 + i * 1.5, 60, 0, i % 2 === 0 ? 0 : 1));
    const rows = medalRows(holding(medals));
    // Which way each one leans is all round the compass, not one way for the whole pile.
    const headings = rows.map((row) => Math.atan2(row.up[2], row.up[0]));
    for (let quarter = 0; quarter < 4; quarter++) {
      const from = -Math.PI + (quarter * Math.PI) / 2;
      expect(headings.filter((heading) => heading >= from && heading < from + Math.PI / 2).length).toBeGreaterThan(5);
    }
    // The lean is fixed by the medal's id: drawn again, or moved by the pusher, it leans exactly as before, so nothing flickers.
    const again = medalRows(holding(medals.map((medal) => ({ ...medal, x: medal.x + 3, y: medal.y + 7 }))));
    again.forEach((row, i) => expect(row.turn).toEqual(rows[i].turn));
    // A medal leaning on others has its low side resting on them, not sunk into them: the lowest point of its under face is where they are.
    for (const row of rows.filter((_, i) => i % 2 === 1)) {
      const sine = Math.sqrt(1 - row.up[1] ** 2);
      expect(row.y - (T / 2) * row.up[1] - R * sine).toBeGreaterThan(T - 0.02);
      expect(row.y - (T / 2) * row.up[1] - R * sine).toBeLessThan(T + 0.01);
    }
    // One that has just come down is level, and leans over as it settles: no jump as it lands.
    const settling = (grown: number) => Math.acos(Math.min(1, medalRows(holding([lying(7, 40, 20, 1, 1, { grown })]))[0].up[1]));
    expect(settling(SETTLE.from)).toBeCloseTo(0, 6);
    expect(settling(0.65)).toBeGreaterThan(0);
    expect(settling(0.65)).toBeLessThan(settling(1));
    expect(settling(1)).toBeGreaterThanOrEqual(LEAN.pile.least - 1e-4);
  });

  it('lays a medal of the upper tier one thickness higher, and one on the pusher higher by the pusher', () => {
    const [table, onTop, pusher, pusherTop] = medalRows(holding([lying(1, 30, 70, 0), lying(2, 31, 71, 0, 1), lying(3, 30, 20, 1), lying(4, 31, 21, 1, 1)]));
    expect(table.y).toBeCloseTo(T / 2, 5);
    expect(pusher.y - table.y).toBeCloseTo(P, 5);
    // One thickness, and the little its lean holds it up by.
    for (const rise of [onTop.y - table.y, pusherTop.y - pusher.y]) {
      expect(rise).toBeGreaterThan(T + R * Math.sin(LEAN.pile.least) - 1e-4);
      expect(rise).toBeLessThan(T + R * Math.sin(LEAN.pile.most) + 1e-4);
    }
    // The contact shadow of each lies on what the medal lies on.
    expect([table.ground, onTop.ground, pusher.ground, pusherTop.ground].map((value) => Math.round(value * 100) / 100)).toEqual([0, T, P, P + T]);
  });

  it('gives no two medals the same turn, and leans the ones on top a little more', () => {
    const medals = Array.from({ length: 40 }, (_, i) => lying(i + 1, 10 + i * 2, 60, 0, i % 2 === 0 ? 0 : 1));
    const rows = medalRows(holding(medals));
    const turns = new Set(rows.map((row) => row.turn.map((value) => value.toFixed(4)).join(',')));
    expect(turns.size).toBe(rows.length);
    const lean = (tier: number) => rows.filter((_, i) => i % 2 === tier).map((row) => Math.acos(Math.min(1, row.up[1])));
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(lean(1))).toBeGreaterThan(mean(lean(0)) * 2);
    expect(Math.max(...lean(1))).toBeLessThan(LEAN.pile.most + 1e-4);
    // Each also has a number of its own, the same every frame.
    expect(new Set(rows.map((row) => row.own)).size).toBeGreaterThan(35);
    expect(medalRows(holding(medals)).map((row) => row.own)).toEqual(rows.map((row) => row.own));
  });

  it('stacks a tower as a column of medals, one thickness each', () => {
    const tower = lying(9, 50, 20, 1, 0, { stack: 12 });
    const rows = medalRows(holding([tower, lying(10, 80, 20, 1)]));
    expect(rows).toHaveLength(13);
    const column = rows.slice(0, 12);
    column.forEach((row, i) => {
      expect(row.y).toBeCloseTo(P + T * (i + 0.5), 5);
      expect(Math.abs(row.x - 50)).toBeLessThan(0.11);
      expect(Math.abs(row.z - 20)).toBeLessThan(0.11);
      // It stands straight, and only its lowest medal touches the pusher.
      expect(row.up[1]).toBeCloseTo(1, 6);
      expect(row.contact).toBe(i === 0 ? 1 : 0);
    });
    // Its top face is as high as the tower is tall.
    expect(column[11].y + T / 2).toBeCloseTo(P + 12 * T, 5);
    // A tower still going up is as tall as it has got, not as tall as it will be.
    expect(medalRows(holding([{ ...tower, stack: 3, grow: 9 }]))).toHaveLength(3);
  });

  it('builds the towers a real payout makes', () => {
    const machine = createMachine(5, 2);
    buildTowers(machine, 180);
    step(machine, 3);
    const towers = machine.medals.filter((medal) => medal.stack > 1);
    expect(towers.length).toBeGreaterThan(5);
    const medals = machine.medals.filter((medal) => !medal.ball);
    const rows = medalRows(machine);
    expect(rows).toHaveLength(medals.reduce((sum, medal) => sum + medal.stack, 0) + machine.falling.filter((medal) => !medal.ball).length);
    const tallest = Math.max(...towers.map((medal) => medal.stack));
    expect(Math.max(...rows.map((row) => row.y))).toBeCloseTo(P + T * (tallest - 0.5), 4);
  });

  it('rolls a fed medal along its rail on its edge, leaning back with its face to the middle, turning as it goes', () => {
    for (const aim of [30, 70]) {
      const machine = holding([]);
      aimBoth(machine, aim);
      dropAt(machine, aim);
      const [rolling] = machine.rolling;
      expect(machine.falling).toHaveLength(0);
      // The tip is wherever the machine has swung it to: here it has not moved yet, and the rail is drawn to it all the same.
      const tip = armTipAt(machine, rolling.arm);
      expect(tip).toBe(machine.tips[rolling.arm]);
      expect(tip).not.toBe(armGoal(machine, rolling.arm));
      const at = (remaining: number) => medalRows({ ...machine, rolling: [{ ...rolling, remaining }] })[0];
      // It comes out at the collar and leaves at the tip.
      const collar = armCollar(rolling.arm);
      const end = armTip(rolling.arm, tip);
      expect([at(FEED.arm).x, at(FEED.arm).y, at(FEED.arm).z]).toEqual([collar.x, collar.height, collar.depth].map(Math.fround));
      expect(at(0).x).toBeCloseTo(end.x, 4);
      expect(at(0).y).toBeCloseTo(ARMS.tip, 4);
      expect(at(0).z).toBeCloseTo(ARMS.depth, 4);
      let last = at(FEED.arm);
      for (let step = 1; step <= 20; step++) {
        const row = at(FEED.arm * (1 - step / 20));
        // Downhill all the way, and away from the player.
        expect(row.y).toBeLessThan(last.y);
        expect(row.z).toBeLessThan(last.z);
        // Once it is clear of the slot it leans back in its channel: its face looks up by that much, and in toward the middle.
        if (step >= 3) {
          expect(row.up[1]).toBeCloseTo(Math.sin(ARMS.lean), 5);
          expect(row.up[0] * (rolling.arm === 0 ? 1 : -1)).toBeGreaterThan(0.6);
        }
        expect(row.contact).toBe(0);
        last = row;
      }
      // It rolls: a mark on its rim goes round by as much as the medal has rolled along the rail.
      const mark = (remaining: number) => {
        const rows = createRows(MEDAL_STRIDE, 4);
        writeMedals(rows, { ...machine, rolling: [{ ...rolling, remaining }] }, []);
        return rotate(rows.data, 4, [1, 0, 0]);
      };
      const earlier = mark(FEED.arm * 0.52);
      const later = mark(FEED.arm * 0.5);
      const turned = Math.acos(Math.min(1, earlier[0] * later[0] + earlier[1] * later[1] + earlier[2] * later[2]));
      expect(turned).toBeCloseTo(rollingSpot(rolling.arm, tip, FEED.arm * 0.5).turned - rollingSpot(rolling.arm, tip, FEED.arm * 0.52).turned, 4);
      expect(turned).toBeGreaterThan(0.2);
      // By the tip it is the way round it will fall and lie, so nothing jumps as it leaves the rail. By then
      // the machine has swung the arm over the aim, and the medal leaves from where the tip is, which is where it is drawn.
      step(machine, ROLL_TIME + 1e-6);
      expect(machine.rolling).toHaveLength(0);
      expect(armTipAt(machine, rolling.arm)).toBe(armGoal(machine, rolling.arm));
      const [falling] = machine.falling;
      expect(falling.source).toBe('player');
      expect(falling.fromX).toBe(armTip(rolling.arm, armTipAt(machine, rolling.arm)).x);
      const leaving = medalRows({ ...machine, falling: [{ ...falling, remaining: falling.duration }] })[0];
      expect(leaving.x).toBeCloseTo(at(0).x, 4);
      expect(leaving.y).toBeCloseTo(at(0).y, 4);
      expect(leaving.z).toBeCloseTo(at(0).z, 4);
      leaving.turn.forEach((value, i) => expect(Math.abs(value)).toBeCloseTo(Math.abs(at(0).turn[i]), 5));
    }
  });

  it('leaves the rail it rolled down when the arm has let it go past the middle, if it is told which arm that was', () => {
    // The left arm follows an aim past the middle while a medal is on it, and lets the medal go there.
    const machine = holding([]);
    dropAt(machine, 40);
    step(machine, 0.3);
    aimBoth(machine, 58);
    const onRail = { ...machine.rolling[0] };
    step(machine, ROLL_TIME);
    const [falling] = machine.falling;
    expect(falling.fromX).toBe(58);
    // With nothing on it any more the arm is already on its way back to rest: the rail as it was when the medal left is asked for.
    const lastOnRail = medalRows({ ...machine, tips: [58, machine.tips[1]], falling: [], rolling: [{ ...onRail, remaining: 0 }] })[0];
    const leaving = (fed?: Map<number, 0 | 1>) => {
      const rows = createRows(MEDAL_STRIDE, 4);
      writeMedals(rows, { ...machine, falling: [{ ...falling, remaining: falling.duration }] }, [], fed);
      return readMedals(rows)[0];
    };
    // Told it was the left arm, it leaves as that arm held it: the same picture as its last on the rail.
    const told = leaving(new Map([[falling.id, 0]]));
    told.up.forEach((value, i) => expect(value).toBeCloseTo(lastOnRail.up[i], 5));
    // Left to guess, it is taken for the arm of the side it left from, which here is the other one: it faces the other way.
    const guessed = leaving();
    expect(guessed.up[0]).toBeLessThan(0);
    expect(told.up[0]).toBeGreaterThan(0);
    // The stage remembers which arm every medal on its way in is on, until it has landed.
    fakeDocument();
    const stage = createStage(1, false);
    const watched = holding([]);
    dropAt(watched, 40);
    trackMedals(stage, watched, 0);
    const id = watched.rolling[0].id;
    expect(stage.fed.get(id)).toBe(0);
    step(watched, ROLL_TIME + 0.01);
    trackMedals(stage, watched, 0);
    expect(watched.falling.map((medal) => medal.id)).toEqual([id]);
    expect(stage.fed.get(id)).toBe(0);
    step(watched, FALL_TIME + 0.01);
    trackMedals(stage, watched, 0);
    expect(stage.fed.size).toBe(0);
  });

  it('shows a fed medal to its slot face on, takes it in edge first, and brings it out onto the rail', () => {
    for (const arm of [0, 1] as const) {
      const machine = holding([]);
      dropAt(machine, arm === 0 ? 30 : 70);
      const [fed] = machine.rolling;
      expect(fed).toMatchObject({ arm, remaining: ROLL_TIME });
      const at = (remaining: number) => medalRows({ ...machine, rolling: [{ ...fed, remaining }] })[0];
      const collar = armCollar(arm);
      // The moment it is fed it is in front of the slot's mouth, nearer the player, upright with its face to the player.
      const shown = at(ROLL_TIME);
      expect(shown.x).toBeCloseTo(collar.x, 5);
      expect(shown.y).toBeCloseTo(collar.height, 5);
      expect(shown.z).toBeCloseTo(collar.depth + SLOT.out, 5);
      expect(Math.abs(shown.up[1])).toBeLessThan(1e-6);
      expect(shown.up[2]).toBeCloseTo(1, 6);
      // As it is taken in it goes to the mouth and turns edge on, still upright, to stand along the rail.
      let last = shown;
      for (let step = 1; step <= 6; step++) {
        const row = at(ROLL_TIME - (FEED.slot * step) / 6 + 1e-9);
        expect(row.z).toBeLessThan(last.z + 1e-6);
        expect(row.up[2]).toBeLessThan(last.up[2] + 1e-6);
        expect(Math.abs(row.up[1])).toBeLessThan(1e-6);
        last = row;
      }
      expect(last.z).toBeCloseTo(collar.depth, 4);
      // Along the rail: its face is square to the way the rail runs across the floor.
      const tip = armTip(arm, machine.tips[arm]);
      const run = Math.hypot(tip.x - collar.x, tip.depth - collar.depth);
      expect((last.up[0] * (tip.x - collar.x) + last.up[2] * (tip.depth - collar.depth)) / run).toBeCloseTo(0, 4);
      // And there the rail has it: the same place, held the same way. Nothing jumps between the two.
      const start = at(FEED.arm);
      expect([start.x, start.y, start.z]).toEqual([collar.x, collar.height, collar.depth].map(Math.fround));
      last.turn.forEach((value, i) => expect(Math.abs(value)).toBeCloseTo(Math.abs(start.turn[i]), 4));
    }
  });

  it('lets a medal go off its arm leaning on its edge, and out of the slot under the hood on its edge, and brings each down flat where it lands', () => {
    const machine = holding([]);
    dropAt(machine, 40);
    step(machine, ROLL_TIME + 1e-6);
    const [falling] = machine.falling;
    const at = (remaining: number, source: 'player' | 'payout' = 'player') => medalRows({ ...machine, falling: [{ ...falling, source, remaining }] })[0];
    // One the player fed leaves the tip of its arm, held as it rolled.
    const start = at(falling.duration);
    expect(start.x).toBeCloseTo(falling.fromX, 4);
    expect(start.y).toBeCloseTo(ARMS.tip, 4);
    expect(start.z).toBeCloseTo(ARMS.depth, 4);
    expect(start.up[1]).toBeCloseTo(Math.sin(ARMS.lean), 4);
    // One the machine pays starts inside the hood over the screen, straight above where the machine has it, on its edge.
    const paid = at(falling.duration, 'payout');
    expect(paid.x).toBeCloseTo(falling.fromX, 4);
    expect(paid.y).toBeCloseTo(PAYOUT_SLOT.height, 4);
    expect(paid.z).toBeCloseTo(PAYOUT_SLOT.depth, 4);
    expect(paid.y).toBeGreaterThan(HOUSING.hood);
    expect(Math.abs(paid.up[1])).toBeLessThan(0.05);
    // Where either ends is where it lies the moment it has landed on other medals: no jump between the two.
    const landed = medalRows(holding([lying(falling.id, falling.x, falling.y, 1, 1, { grown: 0.3 })]))[0];
    expect(landed.y).toBeCloseTo(LANDED, 5);
    for (const source of ['player', 'payout'] as const) {
      const end = at(0, source);
      expect(end.x).toBeCloseTo(falling.x, 4);
      expect(end.z).toBeCloseTo(falling.y, 4);
      expect(end.y).toBeCloseTo(landed.y, 4);
      expect(Math.abs(end.up[1])).toBeCloseTo(1, 5);
      // It only ever comes down. One out of the slot turns over on the way, in front of the screen; one off an
      // arm only falls over onto its back, and its face never looks down.
      let last = at(falling.duration, source).y;
      let flips = 0;
      let side = Math.sign(at(falling.duration, source).up[1]) || 1;
      for (let step = 1; step <= 60; step++) {
        const row = at(falling.duration * (1 - step / 60), source);
        expect(row.y).toBeLessThanOrEqual(last + 1e-6);
        last = row.y;
        if (Math.sign(row.up[1]) !== side && Math.abs(row.up[1]) > 0.05) {
          side = Math.sign(row.up[1]);
          flips++;
        }
        if (source === 'player') expect(row.up[1]).toBeGreaterThan(0);
        expect(row.contact).toBe(0);
      }
      if (source === 'payout') expect(flips).toBeGreaterThanOrEqual(2);
      else expect(flips).toBe(0);
    }
  });

  it('brings the medals of a falling tower down from where they stood to the lower table', () => {
    const machine = holding([]);
    const spill = { id: 77, x: 60, y: 70, level: 0 as const, fromX: 50, fromY: 40, rank: 14, ball: false, remaining: 0.5, duration: 0.5, source: 'spill' as const };
    const at = (remaining: number) => medalRows({ ...machine, falling: [{ ...spill, remaining }] })[0];
    expect(at(0.5).y).toBeCloseTo(P + T * 14.5, 4);
    expect(at(0.5).x).toBeCloseTo(50, 4);
    expect(at(0).y).toBeCloseTo(T / 2, 4);
    expect(at(0).z).toBeCloseTo(70, 4);
    // It starts level in the tower and lands flat, having turned on the way.
    expect(at(0.5).up[1]).toBeCloseTo(1, 5);
    expect(Math.abs(at(0).up[1])).toBeCloseTo(1, 5);
    expect(Math.abs(at(0.25).up[1])).toBeLessThan(0.9);
  });

  it('tips a medal over the edge it left by, and lets one lost to a side go dark', () => {
    const won: ExitingMedal = { id: 5, x: 40, y: 100.5, kind: 'won', side: -1, ball: false, age: 0.2 };
    const lost: ExitingMedal = { id: 6, x: 100.4, y: 90, kind: 'lost', side: 1, ball: false, age: 0.2 };
    const [first, second] = medalRows(holding([]), [won, lost]);
    // Over the front: on toward the player, down, and tipping forward.
    expect(first.z).toBeGreaterThan(100.5);
    expect(first.x).toBeCloseTo(40, 5);
    expect(first.y).toBeLessThan(0);
    expect(first.up[2]).toBeGreaterThan(0.5);
    expect(first.light).toBe(1);
    // Out of the right side: outward, down, tipping outward, and losing the light.
    expect(second.x).toBeGreaterThan(100.4);
    expect(second.z).toBeCloseTo(90, 5);
    expect(second.up[0]).toBeGreaterThan(0.2);
    expect(second.light).toBeGreaterThan(0);
    expect(second.light).toBeLessThan(1);
    // It comes down on the chute beside the table and slides down it, lying along it: no lower, and tipped no further.
    expect(second.y).toBeLessThan(0);
    expect(second.y).toBeCloseTo(chuteHeight(second.x - FIELD.width) + T / 2 + 0.05, 4);
    expect(Math.atan2(second.up[0], second.up[1])).toBeCloseTo(CHUTE_LEAN, 4);
    expect(CHUTE_LEAN).toBeCloseTo(Math.atan(CHUTE.slope), 12);
    // The moment after it left it is still in the air over the chute, and has only begun to tip.
    const [early] = medalRows(holding([]), [{ ...lost, age: 0.03 }]);
    expect(early.y).toBeGreaterThan(chuteHeight(early.x - FIELD.width) + T / 2 + 0.05);
    expect(Math.atan2(early.up[0], early.up[1])).toBeLessThan(CHUTE_LEAN);
    // Once it is in the dark it is not drawn at all; one over the front is drawn until the stage lets it go.
    expect(medalRows(holding([]), [{ ...lost, age: EXIT_TIME * 0.8 }])).toHaveLength(0);
    expect(medalRows(holding([]), [{ ...won, age: EXIT_TIME * 0.9 }])).toHaveLength(1);
  });

  it('tips a medal forward as it comes over the lip of the pusher', () => {
    // Beside the catcher, where a medal goes over the lip as medals always did and falls where the engine has it.
    const beside = CATCHER.from - 10;
    const over = (sinceDrop: number) => medalRows(holding([lying(3, beside, 48, 0, 0, { sinceDrop, grown: 1 })]))[0];
    expect(over(0).y).toBeCloseTo(P + T / 2, 5);
    expect(over(LIP_FALL / 2).y).toBeLessThan(P);
    expect(over(LIP_FALL / 2).up[2]).toBeGreaterThan(0.4);
    expect(over(LIP_FALL / 2).contact).toBe(0);
    expect(over(LIP_FALL / 2).z).toBeCloseTo(48, 5);
    expect(over(LIP_FALL).y).toBeCloseTo(T / 2, 5);
    expect(over(LIP_FALL).up[1]).toBeGreaterThan(0.995);
  });

  it('shows a medal that drops through a START slot sliding to it and nosing into it, one that just misses rattling on its frame, and one between the slots sliding off the foot', () => {
    // A machine that has not run: the lip is as far back as it goes.
    const front = PUSHER.min;
    const mouth = mouthSpot(1, 0);
    const fitting = CHECKERS.positions[1] + CHECKERS.halfWidth * 0.9;
    const over = (x: number, sinceDrop: number) => lying(3, x, front + R, 0, 0, { sinceDrop });
    // One machine for all of it: only the medal on it changes.
    const machine = holding([]);
    /** The row of a medal that came over at `x`, and how the catcher has it. */
    const shown = (x: number, sinceDrop: number) => {
      const held = caught(over(x, sinceDrop), 0);
      machine.medals = [over(x, sinceDrop)];
      const [row] = medalRows(machine);
      if (!held) throw new Error('not caught');
      // Off the foot it is on its way down to lie on the lower table, which is another matter, looked at further on.
      if (held.leg === 'foot') return { row, held };
      // It is the row the catcher gives, to the number, and tipped out of level by as much as the catcher says. Nothing is under it to rest on.
      expect([row.x, row.y, row.z, row.light]).toEqual([held.x, held.height, held.depth, held.light].map(Math.fround));
      expect(row.up[1]).toBeCloseTo(Math.cos(held.tilt), 5);
      expect(row.contact).toBe(0);
      return { row, held };
    };
    // In the step it comes over it is still on the lip's edge, at the height it lay at, level, in full light.
    const first = shown(fitting, 0);
    expect(first.row.z).toBeCloseTo(front, 5);
    expect(first.row.y).toBeCloseTo(P + T / 2, 5);
    expect(first.row.up[1]).toBeGreaterThan(0.9999);
    expect(first.row.light).toBe(1);
    // On the slide it lies on it: leaning with it, its face up and toward the player, in full light, above the slide.
    const sliding = shown(fitting, CATCHER.sink * 0.35);
    expect(sliding.held.leg).toBe('slide');
    expect(sliding.row.up[1]).toBeCloseTo(Math.cos(SLOPE.angle), 5);
    expect(sliding.row.up[2]).toBeGreaterThan(Math.sin(SLOPE.angle) * 0.95);
    expect(sliding.row.light).toBe(1);
    expect(sliding.row.z).toBeGreaterThan(front);
    expect(sliding.row.y).toBeLessThan(P + T / 2);
    // Then it noses into its slot: in the middle of it across, tipped further forward, lower, and darker as it goes.
    let last = sliding.row;
    for (const share of [0.6, 0.8, 0.99]) {
      const { row, held } = shown(fitting, CATCHER.sink * share);
      expect(held.leg).toBe('slot');
      expect(row.x).toBeCloseTo(mouth.x, 4);
      expect(row.up[1]).toBeLessThanOrEqual(last.up[1]);
      expect(row.up[1]).toBeLessThan(Math.cos(SLOPE.angle));
      expect(row.up[2]).toBeGreaterThan(Math.sin(SLOPE.angle));
      expect(row.y).toBeLessThan(last.y);
      expect(row.light).toBeLessThan(last.light);
      last = row;
    }
    expect(last.y).toBeLessThan(mouth.height);
    expect(last.light).toBeLessThan(0.3);
    expect(last.light).toBeGreaterThan(0);
    // Once it is down the throat it lies where the engine has it, under the catcher.
    machine.medals = [over(fitting, CATCHER.sink + 0.01)];
    const [lain] = medalRows(machine);
    expect(lain.x).toBeCloseTo(fitting, 5);
    expect(lain.z).toBeCloseTo(front + R, 5);
    expect(lain.y).toBeCloseTo(T / 2, 5);
    expect(lain.light).toBe(1);
    expect(underCatcher(lain.x, lain.z, R, 0)).toBe(true);
    // One that comes over just beside the slot catches its frame: it is rocked to one side and the other as the catcher has it, about the line down the slide.
    const beside = CHECKERS.positions[1] + CHECKERS.halfWidth + CATCHER.reach / 2;
    const sways: number[] = [];
    for (let sinceDrop = 0; sinceDrop < CATCHER.rattle; sinceDrop += 1 / 240) {
      const { row, held } = shown(beside, sinceDrop);
      // The moment it is level across it is tipped forward only, each medal a little its own way; there is nothing to compare then.
      if (held.leg !== 'frame' || held.heading === 0) continue;
      expect(row.up[0]).toBeCloseTo(-Math.sin(held.heading) * Math.sin(held.tilt), 5);
      expect(row.up[2]).toBeCloseTo(Math.cos(held.heading) * Math.sin(held.tilt), 5);
      expect(row.light).toBe(1);
      sways.push(row.up[0]);
    }
    expect(sways.length).toBeGreaterThan(40);
    expect(Math.max(...sways)).toBeGreaterThan(0.2);
    expect(Math.min(...sways)).toBeLessThan(-0.2);
    // With motion reduced it never is: it slides straight down.
    for (const sinceDrop of [0.1, 0.2, 0.3]) {
      const rows = createRows(MEDAL_STRIDE, 4);
      machine.medals = [over(beside, sinceDrop)];
      writeMedals(rows, machine, [], undefined, true);
      const still = caught(over(beside, sinceDrop), 0, true);
      expect(still?.leg).toBe('slide');
      expect([rows.data[0], rows.data[1], rows.data[2]]).toEqual([still?.x, still?.height, still?.depth].map((value) => Math.fround(value ?? Number.NaN)));
    }
    // One that comes over between the slots slides the length of the slide, lying on it, down to its foot.
    const between = (CHECKERS.positions[0] + CHECKERS.positions[1]) / 2;
    const low = shown(between, CATCHER.slide * 0.7);
    expect(low.held.leg).toBe('slide');
    expect(low.row.z).toBeGreaterThan(front + CATCHER.foot.out / 2);
    expect(low.row.up[1]).toBeCloseTo(Math.cos(SLOPE.angle), 5);
    // With the wings open a medal that would have caught the frame goes down the slot instead.
    const wide = CHECKERS.positions[1] + (CHECKERS.halfWidth + CHECKERS.wingWidth) / 2;
    const rows = createRows(MEDAL_STRIDE, 4);
    machine.medals = [over(wide, CATCHER.sink * 0.8)];
    writeMedals(rows, machine, [], undefined, false, true);
    const open = caught(over(wide, CATCHER.sink * 0.8), 0, false, true);
    expect(open?.chucker).toBe(1);
    expect(caught(over(wide, CATCHER.sink * 0.8), 0)?.chucker).toBe(-1);
    expect([rows.data[0], rows.data[1], rows.data[2]]).toEqual([open?.x, open?.height, open?.depth].map((value) => Math.fround(value ?? Number.NaN)));
    // One that lies on the pusher has not dropped at all.
    expect(medalRows(holding([lying(3, CHECKERS.positions[1], 20, 1)]))[0].up[1]).toBeGreaterThan(0.99);
  });

  it('brings a medal that goes off the foot of the slide down flat on to the lower table in front of it, and lays it there as it will lie, with no jump as it lands or as the engine takes it', () => {
    // A machine that has not run: the lip is as far back as it goes.
    const front = PUSHER.min;
    const between = (CHECKERS.positions[0] + CHECKERS.positions[1]) / 2;
    const over = (sinceDrop: number, more: Partial<Medal> = {}) => lying(3, between, front + R, 0, 0, { sinceDrop, ...more });
    const machine = holding([]);
    /** The row of the medal `sinceDrop` after it came over, how the catcher has it, and the row of a medal lying where the catcher has it. */
    const shown = (sinceDrop: number, more: Partial<Medal> = {}) => {
      machine.medals = [over(sinceDrop, more)];
      const [row] = medalRows(machine);
      const held = caught(over(sinceDrop, more), 0);
      if (!held) throw new Error('not caught');
      const [lain] = medalRows(holding([lying(3, held.x, held.depth, 0, more.tier ?? 0)]));
      return { row, held, lain };
    };
    const edge = shown(CATCHER.slide * 0.75);
    expect(edge.held.leg).toBe('slide');
    // In the air it is where the catcher has it, in full light, further out and lower all the time, and never under the table.
    let last = edge.row;
    let dark = 0;
    const tips: number[] = [];
    for (let share = 0.77; share < 1; share += 0.01) {
      const { row, held } = shown(CATCHER.slide * share);
      expect(held.leg).toBe('foot');
      expect([row.x, row.z, row.light]).toEqual([held.x, held.depth, 1].map(Math.fround));
      expect(row.y).toBeCloseTo(held.height, 5);
      expect(row.z).toBeGreaterThan(last.z);
      expect(row.z).toBeGreaterThan(front + CATCHER.foot.out);
      expect(row.y).toBeLessThan(last.y);
      expect(row.y - T / 2 - R * Math.sqrt(1 - row.up[1] ** 2)).toBeGreaterThan(-1e-4);
      // The dark where it will touch the table comes up under it as it comes down: none as it leaves the foot, all of it as it lands.
      expect(row.contact).toBeCloseTo(held.landed ** 2, 5);
      expect(row.contact).toBeGreaterThanOrEqual(dark);
      expect(row.ground).toBeCloseTo(held.height - T / 2, 5);
      dark = row.contact;
      tips.push(Math.acos(Math.min(1, row.up[1])));
      last = row;
    }
    expect(dark).toBeGreaterThan(0.9);
    // It leaves the foot tipped as the slide tipped it, noses down a little further, and is all but level as it lands: it does not dive.
    expect(tips[0]).toBeCloseTo(SLOPE.angle, 1);
    expect(Math.max(...tips)).toBeGreaterThan(SLOPE.angle);
    expect(Math.max(...tips)).toBeLessThan(SLOPE.angle * 2);
    expect(tips[tips.length - 1]).toBeLessThan(0.1);
    for (const tier of [0, 1] as const) {
      // The moment it is down it is a medal lying on the lower table where the catcher has it, in front of the foot: the very row of one, leaning as it will lean, in the dark it throws.
      const down = shown(CATCHER.slide, { tier });
      expect(down.held).toMatchObject({ leg: 'table', x: between, depth: front + CATCHER.foot.out + CATCHER.lands });
      expect(down.held.height).toBeCloseTo(T / 2, 12);
      expect([down.row.x, down.row.y, down.row.z]).toEqual([down.lain.x, down.held.height + (tier === 1 ? R * Math.sin(Math.acos(down.lain.up[1])) : 0), down.lain.z].map(Math.fround));
      expect(down.row.turn).toEqual(down.lain.turn);
      expect([down.row.ground, down.row.contact, down.row.light]).toEqual([0, 1, 1]);
      expect(down.row.up[1]).toBeGreaterThan(Math.cos(LEAN.pile.most) - 1e-6);
      expect(down.row.up[1]).toBeLessThan(1);
      // And its last row in the air is that row: nothing jumps as it lands.
      const landing = shown(CATCHER.slide - 1e-7, { tier });
      expect(landing.held.leg).toBe('foot');
      expect(Math.hypot(landing.row.x - down.row.x, landing.row.y - down.row.y, landing.row.z - down.row.z)).toBeLessThan(1e-4);
      landing.row.up.forEach((value, at) => expect(value).toBeCloseTo(down.row.up[at], 4));
      expect(landing.row.contact).toBeCloseTo(1, 4);
      expect(landing.row.ground).toBeCloseTo(down.row.ground, 4);
      // A while later it still lies where it came down, which is where the foot's edge was then and its own radius beyond: not
      // where the engine has it, at the foot of the pusher's face.
      const still = shown(CATCHER.slide + 0.3, { tier });
      expect(still.held.leg).toBe('table');
      expect(still.row.z).toBeCloseTo(pusherFront(-0.3) + CATCHER.foot.out + CATCHER.lands, 4);
      expect(still.row.z - (front + R)).toBeGreaterThan(CATCHER.foot.out - 1e-4);
      expect([still.row.ground, still.row.contact]).toEqual([0, 1]);
      // When the engine has it there it is the engine's own medal, and the row is the same row: nothing jumps as the engine takes it.
      const spot = still.held.depth;
      const before = medalRows(holding([over(CATCHER.slide + 0.3, { tier, y: spot - 1e-7 })]))[0];
      const after = medalRows(holding([over(CATCHER.slide + 0.3, { tier, y: spot })]))[0];
      expect(caught(over(CATCHER.slide + 0.3, { tier, y: spot }), 0)).toBeNull();
      expect(Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z)).toBeLessThan(1e-4);
      before.up.forEach((value, at) => expect(value).toBeCloseTo(after.up[at], 5));
      expect([before.ground, before.contact]).toEqual([after.ground, after.contact].map((value) => expect.closeTo(value, 4)));
      expect(after.z).toBeCloseTo(spot, 5);
      expect(after.y).toBeCloseTo(T / 2 + (tier === 1 ? T + R * Math.sin(Math.acos(after.up[1])) : 0), 4);
    }
    // On a medal that lies where it comes down it lies a medal's thickness higher, on that medal: the dark under it is on the medal's top.
    const under = lying(8, between, front + CATCHER.foot.out + CATCHER.lands, 0);
    machine.medals = [over(CATCHER.slide + 0.1), under];
    const [onTop] = medalRows(machine);
    expect(onTop.y).toBeCloseTo(T * 1.5, 5);
    expect(onTop.ground).toBeCloseTo(T, 5);
    expect(onTop.contact).toBe(1);
  });

  it('makes room for more medals than it started with', () => {
    const rows = createRows(MEDAL_STRIDE, 2);
    const medals = Array.from({ length: 300 }, (_, i) => lying(i + 1, (i % 20) * 5, 50 + Math.floor(i / 20), 0));
    writeMedals(rows, holding(medals), []);
    expect(rows.count).toBe(300);
    expect(rows.data.length).toBeGreaterThanOrEqual(300 * MEDAL_STRIDE);
    const read = readMedals(rows);
    expect(read[0].x).toBeCloseTo(0, 5);
    expect(read[299].x).toBeCloseTo(95, 5);
    // The next frame starts the list again without making a new one.
    const { data } = rows;
    writeMedals(rows, holding(medals.slice(0, 10)), []);
    expect(rows.count).toBe(10);
    expect(rows.data).toBe(data);
  });

  it('draws the same number from an id every time, spread evenly', () => {
    const values = Array.from({ length: 2000 }, (_, id) => chance(id + 1, 0));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(chance(42, 3)).toBe(chance(42, 3));
    expect(chance(42, 3)).not.toBe(chance(42, 4));
  });
});

describe('the balls of the 3D field', () => {
  const ballRows = (machine: Machine, exits: ExitingMedal[] = []) => {
    const rows = createRows(BEAD_STRIDE, 4);
    writeBalls(rows, machine, exits);
    return Array.from({ length: rows.count }, (_, index) => Array.from(rows.data.subarray(index * BEAD_STRIDE, (index + 1) * BEAD_STRIDE)));
  };

  it('stands each ball on its table, as large as the 2D renderer draws it', () => {
    const machine = createMachine(7, 2);
    const balls = machine.medals.filter((medal) => medal.ball);
    const rows = ballRows(machine);
    expect(rows).toHaveLength(2);
    rows.forEach((row, index) => {
      expect(row[0]).toBeCloseTo(balls[index].x, 4);
      expect(row[2]).toBeCloseTo(balls[index].y, 4);
      expect(row[1]).toBeCloseTo((balls[index].level === 1 ? P : 0) + BALL_RADIUS, 4);
      expect(row[3]).toBeCloseTo(BALL_RADIUS, 5);
      expect(row[7]).toBe(BEAD.ball);
    });
    // And no ball is among the medals.
    expect(medalRows(machine)).toHaveLength(machine.medals.length - 2);
  });

  it('follows a ball out of the hatch, down in front of the screen and over the front', () => {
    const machine = holding([]);
    dropBall(machine);
    const [falling] = machine.falling;
    // It starts in the hatch, wherever the machine means it to land: its middle just behind the door, in the hood's face.
    const start = ballRows(machine)[0];
    expect(start[0]).toBeCloseTo(HATCH.x, 4);
    expect(start[1]).toBeCloseTo(HATCH.height, 4);
    expect(start[2]).toBeLessThan(HATCH.depth);
    expect(start[2] + BALL_RADIUS).toBeGreaterThan(HATCH.depth);
    expect(HATCH.radius).toBeGreaterThan(BALL_RADIUS);
    // On its way down it is in front of the screen, out from the wall by more than its own size.
    const midway = ballRows({ ...machine, falling: [{ ...falling, remaining: falling.duration / 2 }] })[0];
    expect(midway[1]).toBeGreaterThan(SCREEN.foot);
    expect(midway[1]).toBeLessThan(SCREEN.top);
    expect(midway[2]).toBeGreaterThan(BALL_RADIUS);
    const end = ballRows({ ...machine, falling: [{ ...falling, remaining: 0 }] })[0];
    expect(end[0]).toBeCloseTo(falling.x, 4);
    expect(end[1]).toBeCloseTo(P + BALL_RADIUS, 4);
    expect(end[2]).toBeCloseTo(falling.y, 4);
    const exit: ExitingMedal = { id: 1, x: 30, y: 100.2, kind: 'won', side: -1, ball: true, age: 0.3 };
    const gone = ballRows(holding([]), [exit])[0];
    expect(gone[1]).toBeLessThan(0);
    expect(gone[2]).toBeGreaterThan(100.2);
    expect(medalRows(holding([]), [exit])).toHaveLength(0);
  });
});

describe('the jewels of the 3D field', () => {
  const jewelRows = (machine: Machine, exits: ExitingMedal[] = []) => {
    const rows = createRows(MEDAL_STRIDE, 2);
    writeJewels(rows, machine, exits);
    return readMedals(rows);
  };
  const ballCount = (machine: Machine, exits: ExitingMedal[] = []) => {
    const rows = createRows(BEAD_STRIDE, 4);
    writeBalls(rows, machine, exits);
    return rows.count;
  };

  it('writes a row for every jewel, where the stone stands and turned as it is, and none among the medals or the balls', () => {
    const machine = createMachine(7, 2, 2);
    const jewels = machine.medals.filter((medal) => medal.jewel);
    const rows = jewelRows(machine);
    expect(rows).toHaveLength(2);
    const q = new Float32Array(4);
    rows.forEach((row, index) => {
      const spot = lyingJewel(jewels[index], machine.time);
      expect(row.x).toBeCloseTo(jewels[index].x, 4);
      expect(row.z).toBeCloseTo(jewels[index].y, 4);
      // The row is the middle of its girdle, which is its pavilion above whatever it stands on.
      expect(row.y).toBeCloseTo((jewels[index].level === 1 ? P : 0) + JEWEL_CUT.pavilion, 4);
      expect(row.own).toBeCloseTo(chance(jewels[index].id, 0), 5);
      attitude(q, 0, spot.turn, spot.tilt, spot.heading);
      row.turn.forEach((value, part) => expect(value).toBeCloseTo(q[part], 5));
      // It stands nearly upright, on its point.
      expect(row.up[1]).toBeGreaterThan(0.98);
      expect([row.ground, row.contact, row.light]).toEqual([0, 0, 1]);
    });
    expect(medalRows(machine)).toHaveLength(machine.medals.length - 4);
    expect(ballCount(machine)).toBe(2);
    expect(jewelRows(createMachine(7, 2))).toHaveLength(0);
  });

  it('follows a jewel out of the hatch and over the front', () => {
    const machine = holding([]);
    dropJewel(machine);
    const [falling] = machine.falling;
    // In the air it is a jewel's row and nobody else's.
    const start = jewelRows(machine)[0];
    expect(start.x).toBeCloseTo(HATCH.x, 4);
    expect(start.y).toBeCloseTo(HATCH.height, 4);
    expect(medalRows(machine)).toHaveLength(0);
    expect(ballCount(machine)).toBe(0);
    const midway = jewelRows({ ...machine, falling: [{ ...falling, remaining: falling.duration / 2 }] })[0];
    const spot = fallingJewel({ ...falling, remaining: falling.duration / 2 });
    expect([midway.x, midway.y, midway.z]).toEqual([spot.x, spot.height, spot.depth].map((value) => Math.fround(value)));
    // It tumbles on the way: its table is nowhere near level.
    expect(midway.up[1]).toBeLessThan(0.9);
    // It comes down on the lower table, on its point, well in front of the catcher.
    const end = jewelRows({ ...machine, falling: [{ ...falling, remaining: 0 }] })[0];
    expect(end.x).toBeCloseTo(falling.x, 4);
    expect(end.y).toBeCloseTo(JEWEL_CUT.pavilion, 4);
    expect(end.z).toBeCloseTo(falling.y, 4);
    expect(falling.y - JEWEL_CUT.girdle).toBeGreaterThan(PUSHER.max + CATCHER.foot.out);
    // On the way it goes high over the pusher and the catcher: when it is over the lip it is far above anything on it.
    const above = Array.from({ length: 40 }, (_, step) => fallingJewel({ ...falling, remaining: (falling.duration * step) / 40 })).filter((spot) => spot.depth < PUSHER.max + CATCHER.foot.out);
    expect(above.length).toBeGreaterThan(5);
    for (const spot of above) expect(spot.height).toBeGreaterThan(P + TOWER.max * T);

    // Over the front it turns over into the tray, in full light.
    const over: ExitingMedal = { id: 5, x: 30, y: 100.2, kind: 'won', side: -1, ball: false, jewel: true, age: 0.2 };
    const gone = jewelRows(holding([]), [over])[0];
    const collected = collectedJewel(5, 30, 100.2, 0.2);
    expect(gone.y).toBeCloseTo(collected.height, 4);
    expect(gone.z).toBeCloseTo(collected.depth, 4);
    expect(gone.z).toBeGreaterThan(100.2);
    expect(gone.light).toBe(1);
    expect(medalRows(holding([]), [over])).toHaveLength(0);
    expect(ballCount(holding([]), [over])).toBe(0);
  });
});

describe('a ball at the catcher in the 3D field', () => {
  const front = PUSHER.min;
  const ball = (x: number, y: number, more: Partial<Medal> = {}) => lying(1, x, y, 0, 0, { ball: true, ...more });
  /** The balls of a machine holding these, as the two lists a renderer keeps: the ones in the open, and the ones under the catcher. */
  const lists = (medals: Medal[]) => {
    const open = createRows(BEAD_STRIDE, 4);
    const under = createRows(BEAD_STRIDE, 4);
    writeBalls(open, holding(medals), [], under);
    const read = (rows: Rows) => Array.from({ length: rows.count }, (_, index) => Array.from(rows.data.subarray(index * BEAD_STRIDE, (index + 1) * BEAD_STRIDE)));
    return { open: read(open), under: read(under) };
  };

  it('keeps a ball that lies under the catcher, wholly or in part, in a list of its own', () => {
    // At the foot of the pusher's face in the middle; half out from under the catcher's front; lapping its end.
    for (const [x, y] of [
      [50, front + R],
      [50, front + CATCHER.foot.out + BALL_RADIUS - 0.5],
      [CATCHER.to + BALL_RADIUS - 0.5, front + R],
    ]) {
      const { open, under } = lists([ball(x, y)]);
      expect(open).toEqual([]);
      expect(under).toHaveLength(1);
      // It stands on the table where the engine has it, as large as ever: nothing about it is changed but the list it is in.
      expect(under[0].slice(0, 4)).toEqual([x, BALL_RADIUS, y, BALL_RADIUS].map(Math.fround));
      expect(under[0][7]).toBe(BEAD.ball);
      expect(underCatcher(x, y, BALL_RADIUS, 0)).toBe(true);
    }
    // Out in front of the catcher, beside it, far down the table, or on the pusher: in the open, like any ball.
    for (const medal of [ball(50, front + CATCHER.foot.out + BALL_RADIUS + 0.5), ball(CATCHER.from - BALL_RADIUS - 0.5, front + R), ball(50, 90), lying(1, 50, 20, 1, 0, { ball: true })]) {
      const { open, under } = lists([medal]);
      expect(under).toEqual([]);
      expect(open).toHaveLength(1);
    }
    // Whoever keeps one list gets every ball in it, as before.
    const one = createRows(BEAD_STRIDE, 4);
    writeBalls(one, holding([ball(50, front + R), ball(50, 90)]), []);
    expect(one.count).toBe(2);
    // The second list is started again every frame, like the first.
    const open = createRows(BEAD_STRIDE, 4);
    const under = createRows(BEAD_STRIDE, 4);
    writeBalls(open, holding([ball(50, front + R)]), [], under);
    writeBalls(open, holding([]), [], under);
    expect([open.count, under.count]).toEqual([0, 0]);
  });

  it('rolls a ball that comes over the lip at the catcher down its slide and off its foot, and then has it under the catcher', () => {
    const over = (x: number, sinceDrop: number) => lists([ball(x, front + R, { sinceDrop })]);
    // It is in the open while it rolls, and starts where it stood on the pusher, on the lip's edge.
    const start = over(50, 0);
    expect(start.under).toEqual([]);
    expect(start.open[0][1]).toBeCloseTo(P + BALL_RADIUS, 5);
    expect(start.open[0][2]).toBeCloseTo(front, 5);
    // All the way down it is where the catcher has it, to the number, as large as ever: further out and lower as it goes.
    let last = start.open[0];
    for (const share of [0.2, 0.4, 0.6, 0.8, 0.99]) {
      const sinceDrop = CATCHER.slide * share;
      const { open, under } = over(50, sinceDrop);
      const rolled = rolling(ball(50, front + R, { sinceDrop }), BALL_RADIUS, 0);
      if (!rolled) throw new Error('not rolling');
      expect(under).toEqual([]);
      expect(open[0].slice(0, 4)).toEqual([rolled.x, rolled.height, rolled.depth, BALL_RADIUS].map(Math.fround));
      expect(open[0][7]).toBe(BEAD.ball);
      expect(open[0][2]).toBeGreaterThan(last[2]);
      expect(open[0][1]).toBeLessThan(last[1]);
      // It stands on the slide and never in it: its middle is its own radius clear of the slide, or more.
      const out = open[0][2] - front;
      const up = open[0][1] - CATCHER.deck;
      if (out < CATCHER.foot.out) expect(up * Math.cos(SLOPE.angle) + out * Math.sin(SLOPE.angle)).toBeGreaterThan(BALL_RADIUS - 1e-3);
      last = open[0];
    }
    // It ends out past the foot of the slide, coming down to stand on the lower table.
    expect(last[2]).toBeGreaterThan(front + CATCHER.foot.out);
    expect(last[1]).toBeLessThan(BALL_RADIUS + 0.5);
    const landing = over(50, CATCHER.slide - 1e-6).open[0];
    expect(landing[1]).toBeCloseTo(BALL_RADIUS, 3);
    // Then it stands there, in front of the foot and against its edge, where the catcher has it: not where the engine has it,
    // under the catcher. It is where it came down, to the number. It laps the foot's edge by a hair, so it is in the list that is
    // drawn behind the catcher's hood, which hides only what of a ball is under the catcher.
    const spot = front + CATCHER.foot.out + clearOfFoot(BALL_RADIUS);
    const down = over(50, CATCHER.slide);
    expect(down.open).toEqual([]);
    expect(down.under).toHaveLength(1);
    expect(down.under[0].slice(0, 4)).toEqual([50, BALL_RADIUS, spot, BALL_RADIUS].map(Math.fround));
    expect(down.under[0][7]).toBe(BEAD.ball);
    expect(landing[2]).toBeCloseTo(spot, 3);
    expect(spot - BALL_RADIUS).toBeLessThan(front + CATCHER.foot.out);
    expect(spot).toBeGreaterThan(front + CATCHER.foot.out + BALL_RADIUS * 0.8);
    // A ball that came down a while ago, when the lip was further out, stands where the foot's edge was then: the catcher
    // has drawn back from it since, and it is in the open, out in front of the foot.
    for (const since of [0.2, 0.6]) {
      const then = pusherFront(-since) + CATCHER.foot.out + clearOfFoot(BALL_RADIUS);
      const stood = over(50, CATCHER.slide + since);
      expect(stood.under).toEqual([]);
      expect(stood.open).toHaveLength(1);
      expect(stood.open[0][0]).toBe(50);
      expect(stood.open[0][1]).toBeCloseTo(BALL_RADIUS, 6);
      expect(stood.open[0][2]).toBeCloseTo(then, 4);
      expect(then - BALL_RADIUS).toBeGreaterThan(front + CATCHER.foot.out);
    }
    // When the engine has it there it is the engine's, and stands where the engine has it.
    const there = pusherFront(-0.6) + CATCHER.foot.out + clearOfFoot(BALL_RADIUS);
    const taken = lists([ball(50, there + 0.5, { sinceDrop: CATCHER.slide + 0.6 })]);
    expect([...taken.open, ...taken.under][0].slice(0, 3)).toEqual([50, BALL_RADIUS, there + 0.5].map(Math.fround));
    // One that comes over the lip past the end of the catcher, or lapping it, drops to the table like any ball.
    for (const x of [CATCHER.to + BALL_RADIUS - 0.5, 10]) {
      const { open } = over(x, LIP_FALL * 0.99);
      expect(open[0][1]).toBeGreaterThan(BALL_RADIUS);
      expect(open[0][1]).toBeLessThan(BALL_RADIUS + 0.2);
    }
  });
});

/** Every triangle of a shape that has the origin inside it faces outward when its corners run anticlockwise seen from outside. */
function outward(shape: Shape): boolean {
  const corner = (index: number) => [shape.vertices[index * 6], shape.vertices[index * 6 + 1], shape.vertices[index * 6 + 2]];
  for (let i = 0; i < shape.indices.length; i += 3) {
    const [a, b, c] = [corner(shape.indices[i]), corner(shape.indices[i + 1]), corner(shape.indices[i + 2])];
    const normal = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const size = Math.hypot(...normal);
    // A sliver with no area faces nowhere.
    if (size < 1e-9) continue;
    if (normal[0] * (a[0] + b[0] + c[0]) + normal[1] * (a[1] + b[1] + c[1]) + normal[2] * (a[2] + b[2] + c[2]) <= 0) return false;
  }
  return true;
}

describe('the shapes', () => {
  it('makes a medal as wide and as thick as the engine says, closed and facing outward', () => {
    for (const shape of [medalShape(32, 0.17), medalShape(16, 0)]) {
      const count = shape.vertices.length / 6;
      expect(Math.max(...shape.indices)).toBe(count - 1);
      expect(shape.indices.length % 3).toBe(0);
      let widest = 0;
      let highest = 0;
      for (let i = 0; i < count; i++) {
        const [x, y, z, nx, ny, nz] = shape.vertices.subarray(i * 6, i * 6 + 6);
        widest = Math.max(widest, Math.hypot(x, z));
        highest = Math.max(highest, Math.abs(y));
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 2);
        // No part of the surface faces into the medal.
        expect(nx * x + nz * z).toBeGreaterThanOrEqual(-1e-6);
        expect(ny * y).toBeGreaterThanOrEqual(-1e-6);
      }
      expect(widest).toBeCloseTo(R, 5);
      expect(highest).toBeCloseTo(T / 2, 5);
      expect(outward(shape)).toBe(true);
    }
    // The medal in the picture has a rounded edge; the one in the shadow map is plainer.
    expect(medalShape(32, 0.17).indices.length).toBeGreaterThan(medalShape(16, 0).indices.length);
  });

  it('makes a jewel of flat faces, each with corners of its own, closed and facing outward', () => {
    const shape = jewelShape();
    const corners = JEWEL_FACETS.reduce((sum, face) => sum + face.corners.length, 0);
    expect(shape.vertices.length).toBe(corners * 6);
    // The table is a fan of triangles and every other face is one.
    expect(shape.indices.length).toBe(((JEWEL_CUT.sides - 2) + JEWEL_CUT.sides * 3) * 3);
    expect(Math.max(...shape.indices)).toBe(corners - 1);
    let widest = 0;
    let highest = -Infinity;
    let lowest = Infinity;
    for (let i = 0; i < corners; i++) {
      const [x, y, z, nx, ny, nz] = shape.vertices.subarray(i * 6, i * 6 + 6);
      widest = Math.max(widest, Math.hypot(x, z));
      highest = Math.max(highest, y);
      lowest = Math.min(lowest, y);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
    }
    expect(widest).toBeCloseTo(JEWEL_CUT.girdle, 5);
    expect(highest).toBeCloseTo(JEWEL_CUT.crown, 5);
    expect(lowest).toBeCloseTo(-JEWEL_CUT.pavilion, 5);
    expect(outward(shape)).toBe(true);
    // Every corner of a face carries that face's way of facing: the faces are flat, which is what makes them flash one at a time.
    let at = 0;
    for (const face of JEWEL_FACETS) {
      for (let corner = 0; corner < face.corners.length; corner++, at++) {
        face.normal.forEach((value, axis) => expect(shape.vertices[at * 6 + 3 + axis]).toBeCloseTo(value, 5));
      }
    }
  });

  it('makes a ball of radius one', () => {
    const shape = ballShape(12, 8);
    for (let i = 0; i < shape.vertices.length; i += 6) expect(Math.hypot(shape.vertices[i], shape.vertices[i + 1], shape.vertices[i + 2])).toBeCloseTo(1, 5);
    expect(Math.max(...shape.indices)).toBe(shape.vertices.length / 6 - 1);
    expect(outward(shape)).toBe(true);
  });

  it('turns a medal by its quaternion', () => {
    const q = new Float32Array(4);
    // Level, turned a quarter about its axis: its face still looks up, and what pointed across now points away from the player.
    attitude(q, 0, Math.PI / 2, 0, 0);
    expect(rotate(q, 0, [0, 1, 0])[1]).toBeCloseTo(1, 6);
    expect(rotate(q, 0, [1, 0, 0])[2]).toBeCloseTo(-1, 6);
    // Tipped a quarter about the line across the field: its face looks at the player, its front edge is down.
    attitude(q, 0, 0, Math.PI / 2, 0);
    expect(rotate(q, 0, [0, 1, 0])[2]).toBeCloseTo(1, 6);
    expect(rotate(q, 0, [0, 0, 1])[1]).toBeCloseTo(-1, 6);
    // Tipped about the line toward the player instead: its face looks to the left.
    attitude(q, 0, 0, Math.PI / 2, Math.PI / 2);
    expect(rotate(q, 0, [0, 1, 0])[0]).toBeCloseTo(-1, 6);
  });
});

describe('the face of a medal', () => {
  it('has a star in the middle, a border near the rim and a flat field between', () => {
    expect(reliefHeight(0, 0)).toBe(1);
    expect(reliefHeight(0, -0.4)).toBeGreaterThan(0.2);
    expect(reliefHeight(0.33, 0.33)).toBe(0);
    expect(reliefHeight(0.86, 0)).toBeCloseTo(1, 5);
    expect(reliefHeight(0.99, 0)).toBe(0);
    // A bead of the ring, and the gap between two of them.
    expect(reliefHeight(0.7, 0)).toBeGreaterThan(0.7);
    expect(reliefHeight(0.7 * Math.cos(Math.PI / 28), 0.7 * Math.sin(Math.PI / 28))).toBe(0);
  });

  it('is a texture of leans and heights', () => {
    const size = 64;
    const bytes = reliefMap(size);
    expect(bytes).toHaveLength(size * size * 4);
    const texel = (i: number, j: number) => Array.from(bytes.subarray((j * size + i) * 4, (j * size + i) * 4 + 4));
    // The corner of the square is outside the medal: level, at the height of the field, and with no edge near.
    expect(texel(0, 0)).toEqual([128, 128, 0, 0]);
    // The middle of the star is its top, and level too.
    const [leanX, leanY, height] = texel(size / 2, size / 2);
    expect(height).toBe(255);
    expect(Math.abs(leanX - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(leanY - 128)).toBeLessThanOrEqual(1);
    // Somewhere it leans: the edges of the border and the facets of the star.
    let leaning = 0;
    for (let i = 0; i < bytes.length; i += 4) if (Math.abs(bytes[i] - 128) > 20 || Math.abs(bytes[i + 1] - 128) > 20) leaning++;
    expect(leaning).toBeGreaterThan(size * size * 0.03);
    expect(leaning).toBeLessThan(size * size * 0.6);
    // The fourth number is how steep the relief is: nothing in the middle of the star or out in the field, a
    // good deal on the edge of the border, and never more where it leans less. It is what outlines the star and the ring.
    const steep = (i: number, j: number) => texel(i, j)[3];
    expect(steep(size / 2, size / 2)).toBe(0);
    let edges = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      if (bytes[i + 3] > 100) edges++;
      if (bytes[i + 3] === 0) expect(Math.abs(bytes[i] - 128) + Math.abs(bytes[i + 1] - 128)).toBeLessThanOrEqual(1);
    }
    expect(edges).toBeGreaterThan(size * size * 0.03);
    expect(edges).toBeLessThan(size * size * 0.4);
  });
});

/** Stands in for the `document` the textures are painted with: every canvas takes any drawing and keeps none of it. */
function fakeDocument(): void {
  const gradient = { addColorStop: () => undefined };
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => new Proxy({}, { get: () => () => gradient, set: () => true }),
    }),
  });
}

/** The corners of a solid list, read back. */
function corners(solid: Solid, first = 0, count = solid.count - first) {
  return Array.from({ length: count }, (_, index) => {
    const at = (first + index) * SOLID_STRIDE;
    const d = solid.data;
    // Adding nothing turns a zero written as -0 into plain 0.
    return { x: d[at], y: d[at + 1], z: d[at + 2], normal: [d[at + 3] + 0, d[at + 4] + 0, d[at + 5] + 0], u: d[at + 6], v: d[at + 7], colour: [d[at + 8], d[at + 9], d[at + 10]], gloss: d[at + 11], glow: d[at + 12] };
  });
}

describe('the cabinet as shapes', () => {
  it('reads a colour of the 2D drawing as an amount of light', () => {
    expect(light('#ffffff')).toEqual([1, 1, 1]);
    expect(light('#000000')).toEqual([0, 0, 0]);
    const [r, g, b] = light('#ff8000');
    expect(r).toBe(1);
    expect(g).toBeCloseTo((128 / 255) ** 2.2, 9);
    expect(b).toBe(0);
    expect(light('#ffffff', 1.5)).toEqual([1.5, 1.5, 1.5]);
  });

  it('turns every surface to face the camera, whichever way round its corners are given', () => {
    const solid = new Solid(12);
    solid.quad(0, 0, 0, 100, 0, 0, 100, 0, 100, 0, 0, 100);
    solid.quad(0, 0, 100, 100, 0, 100, 100, 0, 0, 0, 0, 0);
    expect(solid.count).toBe(12);
    for (const corner of corners(solid)) expect(corner.normal).toEqual([0, 1, 0]);
    // The picture runs from the first corner to the second across and to the last down.
    const [a, b, c, , , d] = corners(solid);
    expect([a.u, a.v, b.u, b.v, c.u, c.v, d.u, d.v]).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    // A list that fills up grows, and starting it again keeps what it grew to.
    for (let i = 0; i < 10; i++) solid.box(0, 0, 0, 1, 1, 1);
    expect(solid.count).toBe(12 + 10 * 24);
    expect(solid.clear().count).toBe(0);
    expect(solid.data.length).toBeGreaterThanOrEqual(252 * SOLID_STRIDE);
  });

  it('builds the table, the wall under the screen, the side walls and the chutes, each run with its picture', () => {
    const solid = new Solid(600);
    const parts = buildCabinet(solid);
    expect(parts.map((part) => part.art)).toEqual(['table', 'foot', 'lip', 'wall', 'plain']);
    // The runs follow one another and take in every corner.
    let next = 0;
    for (const part of parts) {
      expect(part.first).toBe(next);
      expect(part.count % 6).toBe(0);
      next += part.count;
    }
    expect(next).toBe(solid.count);
    // The lower table is the whole field at height 0, facing up, its picture square on it.
    const table = corners(solid, parts[0].first, parts[0].count);
    expect(table).toHaveLength(6);
    for (const corner of table) {
      expect(corner.y).toBe(0);
      expect(corner.normal).toEqual([0, 1, 0]);
      expect(corner.u).toBeCloseTo(corner.x / FIELD.width, 6);
      expect(corner.v).toBeCloseTo(corner.z / FIELD.depth, 6);
    }
    // The wall under the screen is one picture on two surfaces: the front of the shelf, which stands out from
    // the wall, and under it the panel, down to the top of the pusher. Both face the player.
    const foot = corners(solid, parts[1].first, parts[1].count);
    expect(foot).toHaveLength(12);
    const [shelf, panel] = [foot.slice(0, 6), foot.slice(6)];
    expect([Math.min(...shelf.map((corner) => corner.y)), Math.max(...shelf.map((corner) => corner.y))]).toEqual([HOUSING.shelf, SCREEN.foot]);
    expect([Math.min(...panel.map((corner) => corner.y)), Math.max(...panel.map((corner) => corner.y))]).toEqual([P, HOUSING.shelf]);
    for (const corner of shelf) expect(corner.z).toBe(Math.fround(HOUSING.ledge));
    for (const corner of panel) expect(corner.z).toBe(0);
    for (const corner of foot) {
      expect(corner.normal).toEqual([0, 0, 1]);
      // The picture's top is the foot of the screen and its bottom the top of the pusher, whichever of the two a point is on.
      expect(corner.v).toBeCloseTo((SCREEN.foot - corner.y) / (SCREEN.foot - P), 6);
    }
    expect(SHELF_SHARE).toBeCloseTo((SCREEN.foot - HOUSING.shelf) / (SCREEN.foot - P), 12);
    // The walls stop where the sides open, the two face each other, and they go up to the top, beside the screen.
    const walls = corners(solid, parts[3].first, parts[3].count);
    expect(Math.max(...walls.map((corner) => corner.z))).toBe(FIELD.sideOpenFrom);
    expect(new Set(walls.map((corner) => corner.normal[0]))).toEqual(new Set([1, -1]));
    expect(Math.max(...walls.map((corner) => corner.y))).toBe(HEIGHT.top);
    // Nothing of the cabinet reaches into the field above the tables but the housing of the screen, which is
    // against the back wall: no further out than the hood, and under the hood no further out than a tower can come to.
    for (const corner of corners(solid)) {
      const inside = corner.x > 0.5 && corner.x < FIELD.width - 0.5 && corner.z > 0.5 && corner.z < FIELD.depth - 0.5;
      if (inside) expect(corner.y <= 0.05 || (corner.y >= HOUSING.shelf && corner.z <= (corner.y >= HOUSING.hood ? HOUSING.out + 0.6 : HOUSING.ledge + 0.1))).toBe(true);
      expect(Number.isFinite(corner.x + corner.y + corner.z)).toBe(true);
    }
    expect(HOUSING.ledge).toBeLessThan(PUSHER.min - Math.max(...TOWER.rows) - R);
    expect(HOUSING.shelf).toBeGreaterThan(P + T * 3 + BALL_RADIUS * 2);
  });

  it('builds beside each open side a chute that falls away from the table, with arrows on it that point the way out', () => {
    const solid = new Solid(600);
    const plain = buildCabinet(solid).find((part) => part.art === 'plain');
    if (!plain) throw new Error('no plain part');
    const all = corners(solid, plain.first, plain.count);
    for (const side of [-1, 1]) {
      const edge = side < 0 ? 0 : FIELD.width;
      const out = (corner: { x: number }) => (corner.x - edge) * side;
      // The chute: one surface from under the table's edge outward and down, from where the wall ends to past the front, turned up toward the player's side of it.
      const chute = all.filter((corner) => corner.glow === 0 && corner.normal[1] > 0.5 && Math.abs(corner.normal[0]) > 0.1 && out(corner) >= -1e-4 && corner.z >= FIELD.sideOpenFrom);
      expect(chute).toHaveLength(6);
      for (const corner of chute) {
        expect(corner.y).toBeCloseTo(chuteHeight(out(corner)), 4);
        // It faces up, and leans a little outward as it falls away from the table: gently, so that the player still looks down on it.
        expect(corner.normal[0] * side).toBeGreaterThan(0);
        expect(corner.normal[1]).toBeGreaterThan(0.9);
      }
      expect(Math.min(...chute.map(out))).toBeCloseTo(0, 4);
      expect(Math.max(...chute.map((corner) => corner.y))).toBeCloseTo(-CHUTE.drop, 4);
      expect(Math.min(...chute.map((corner) => corner.z))).toBe(FIELD.sideOpenFrom);
      expect(Math.max(...chute.map((corner) => corner.z))).toBeGreaterThan(FIELD.depth);
      // The arrows: lit, lying on the chute, two barbs each that meet at the point, which is the further out.
      const arrows = all.filter((corner) => corner.glow === 1 && out(corner) > 1 && corner.y < 0 && corner.z > FIELD.sideOpenFrom + 0.5 && corner.z < FIELD.depth);
      expect(arrows).toHaveLength(CHUTE.marks.length * 2 * 6);
      for (const corner of arrows) {
        expect(corner.y).toBeCloseTo(chuteHeight(out(corner)) + 0.05, 4);
        expect(out(corner)).toBeGreaterThanOrEqual(CHUTE.near - 1e-4);
        expect(out(corner)).toBeLessThanOrEqual(CHUTE.far + 1e-4);
      }
      CHUTE.marks.forEach((mark, index) => {
        const arrow = arrows.slice(index * 12, index * 12 + 12);
        const point = arrow.filter((corner) => Math.abs(out(corner) - CHUTE.far) < 1e-4);
        const barbs = arrow.filter((corner) => Math.abs(out(corner) - CHUTE.near) < 1e-4);
        // The point is at the arrow's own depth; the barbs' ends are half its span to either side of that.
        for (const corner of point) expect(Math.abs(corner.z - mark)).toBeLessThan(0.6);
        expect(Math.min(...barbs.map((corner) => corner.z))).toBeCloseTo(mark - CHUTE.span / 2 - 0.5, 4);
        expect(Math.max(...barbs.map((corner) => corner.z))).toBeCloseTo(mark + CHUTE.span / 2 + 0.5, 4);
        // All of it beside the open stretch of the table, and near enough to the table's edge to be in the picture.
        expect(mark - CHUTE.span / 2).toBeGreaterThan(FIELD.sideOpenFrom);
        expect(mark + CHUTE.span / 2).toBeLessThan(FIELD.depth);
        const seen = project(edge + side * CHUTE.far, chuteHeight(CHUTE.far), mark);
        expect(seen.x).toBeGreaterThan(0);
        expect(seen.x).toBeLessThan(VIEW.width);
      });
    }
    expect(CHUTE.far).toBeGreaterThan(CHUTE.near);
    expect(CHUTE.slope).toBeGreaterThan(0);
  });

  it('builds the housing round the screen and leaves the opening in it clear for the page\u2019s screen', () => {
    const solid = new Solid(600);
    const all = corners(solid, 0, buildCabinet(solid).reduce((sum, part) => sum + part.count, 0));
    const opening = { left: SCREEN.left + HOUSING.lap, right: SCREEN.right - HOUSING.lap, foot: SCREEN.foot + HOUSING.lap, top: SCREEN.top - HOUSING.lap };
    // Nothing solid is drawn over the opening: no surface on the wall covers any point inside it, and nothing stands in front of it.
    const covers = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, x: number, y: number) => {
      const side = (p: { x: number; y: number }, q: { x: number; y: number }) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
      const [d1, d2, d3] = [side(a, b), side(b, c), side(c, a)];
      return (d1 > 1e-6 && d2 > 1e-6 && d3 > 1e-6) || (d1 < -1e-6 && d2 < -1e-6 && d3 < -1e-6);
    };
    let onWall = 0;
    for (let i = 0; i < all.length; i += 3) {
      const [a, b, c] = [all[i], all[i + 1], all[i + 2]];
      // A surface that faces the player, on the wall or out from it: the strips, the shelf, the hood, the wall itself.
      if (Math.abs(a.normal[2]) < 0.2 || Math.min(a.z, b.z, c.z) > HOUSING.out + 1 || Math.max(a.x, b.x, c.x) < 0 || Math.min(a.x, b.x, c.x) > FIELD.width) continue;
      onWall++;
      for (const x of [opening.left + 0.01, 30, 50, 70, opening.right - 0.01]) {
        for (const y of [opening.foot + 0.01, 45, 60, 75, opening.top - 0.01]) expect(covers(a, b, c, x, y)).toBe(false);
      }
    }
    expect(onWall).toBeGreaterThan(40);
    // The housing laps over each edge of the screen: the wall is closed right up to the opening on every side.
    const at = (x: number, y: number, z: number) => all.some((corner) => Math.abs(corner.x - x) < 1e-4 && Math.abs(corner.y - y) < 1e-4 && Math.abs(corner.z - z) < 1e-4);
    expect(at(opening.left, HOUSING.hood, 0)).toBe(true);
    expect(at(opening.right, HOUSING.hood, 0)).toBe(true);
    expect(at(FIELD.width + 0.8, opening.foot, 0)).toBe(true);
    expect(at(FIELD.width + 0.8, opening.top, 0)).toBe(true);
    expect(opening.left).toBeGreaterThan(SCREEN.left);
    expect(opening.top).toBeLessThan(SCREEN.top);
    // The strips beside it and the shelf under it stand out from the wall by the same; the hood over it stands out further, up to the top of the wall.
    const strips = all.filter((corner) => corner.z === Math.fround(HOUSING.ledge) && corner.y > SCREEN.foot && corner.normal[2] === 1);
    expect(strips.some((corner) => corner.x < SCREEN.left)).toBe(true);
    expect(strips.some((corner) => corner.x > SCREEN.right)).toBe(true);
    expect(Math.max(...strips.map((corner) => corner.y))).toBe(HOUSING.hood);
    const hood = all.filter((corner) => corner.z === HOUSING.out && corner.normal[2] === 1);
    expect([Math.min(...hood.map((corner) => corner.y)), Math.max(...hood.map((corner) => corner.y))]).toEqual([HOUSING.hood, HEIGHT.top]);
    expect(Math.min(...hood.map((corner) => corner.x))).toBeLessThanOrEqual(0);
    expect(Math.max(...hood.map((corner) => corner.x))).toBeGreaterThanOrEqual(FIELD.width);
    // Its top is seen from above, and under its face is the lit lip of the gap the machine pays from, all the way across.
    expect(all.some((corner) => corner.y === HEIGHT.top && corner.normal[1] === 1 && corner.z === HOUSING.out)).toBe(true);
    const lip = all.filter((corner) => corner.glow >= 1 && corner.z > HOUSING.out && corner.z < HOUSING.out + 0.1 && corner.y <= HOUSING.hood + 0.71);
    expect(lip).toHaveLength(6);
    expect(Math.max(...lip.map((corner) => corner.x)) - Math.min(...lip.map((corner) => corner.x))).toBeGreaterThanOrEqual(FIELD.width);
    // In the middle of the hood's face is the frame of the hatch, round, big enough for a ball, and all of it on the face.
    const frame = all.filter((corner) => corner.z === HOUSING.out + 0.5 && Math.hypot(corner.x - HATCH.x, corner.y - HATCH.height) < HATCH.radius + 1e-3);
    expect(frame.length).toBeGreaterThan(100);
    expect(Math.max(...frame.map((corner) => Math.hypot(corner.x - HATCH.x, corner.y - HATCH.height)))).toBeCloseTo(HATCH.radius, 4);
    expect(HATCH.radius).toBeGreaterThan(BALL_RADIUS);
    // None of it is behind the wall.
    expect(Math.min(...all.map((corner) => corner.z))).toBeGreaterThanOrEqual(0);
  });

  it('hangs each slot on a bracket that comes in from the cabinet\u2019s frame at a front corner', () => {
    const solid = new Solid(600);
    const plain = buildCabinet(solid).find((part) => part.art === 'plain');
    if (!plain) throw new Error('no plain part');
    const all = corners(solid, plain.first, plain.count);
    for (const arm of [0, 1] as const) {
      const collar = armCollar(arm);
      const out = arm === 0 ? -1 : 1;
      const bar = all.filter((corner) => (corner.x - FIELD.width / 2) * out > 0 && Math.abs(corner.y - collar.height) < 1.31 && corner.z > collar.depth - 3.5 && corner.z < collar.depth);
      expect(bar).toHaveLength(24);
      // From inside the slot's body, out past the side of the field to where the picture ends.
      const reach = bar.map((corner) => (corner.x - collar.x) * out);
      expect(Math.min(...reach)).toBeLessThan(SLOT.ring);
      expect(Math.min(...reach)).toBeGreaterThan(0);
      const edge = project(arm === 0 ? 0 : FIELD.width, collar.height, collar.depth);
      const end = project(collar.x + Math.max(...reach) * out, collar.height, collar.depth);
      expect(arm === 0 ? end.x : VIEW.width - end.x).toBeLessThan(0);
      expect(arm === 0 ? edge.x : VIEW.width - edge.x).toBeLessThan(0);
    }
  });

  /** The moving parts at a moment of a new machine's life, its arms' tips wherever they are put. */
  const moving = (time: number, _aim = 50, stage: Stage = createStage(1, false), tips?: [number, number]) => {
    const machine = createMachine(3);
    machine.time = time;
    if (tips) machine.tips = tips;
    const solid = new Solid(100);
    buildMoving(solid, machine, pusherFront(time), stage, { showGuide: true });
    return { solid, machine, stage };
  };

  it('moves the pusher with its stroke, its top a picture that rides with the lip', () => {
    fakeDocument();
    for (const time of [0, PUSHER.period / 4, PUSHER.period / 2]) {
      const front = pusherFront(time);
      const { solid } = moving(time);
      const top = corners(solid, MOVING_PARTS[0].first, MOVING_PARTS[0].count);
      expect(MOVING_PARTS[0].art).toBe('pusher');
      for (const corner of top) {
        expect(corner.y).toBe(P);
        expect(corner.normal).toEqual([0, 1, 0]);
        // A point of the picture is always the same distance behind the lip.
        expect(corner.v * PUSHER.max).toBeCloseTo(front - corner.z, 4);
      }
      // Its face reaches down to the lower table at the lip, and faces the player.
      const rest = corners(solid, MOVING_PARTS[1].first, MOVING_PARTS[1].count);
      const face = rest.filter((corner) => corner.z === Math.fround(front) && corner.normal[2] === 1);
      expect(face.length).toBe(6);
      expect(Math.min(...face.map((corner) => corner.y))).toBe(0);
    }
  });

  /** Where a point is on an arm's rail: how far along it from the collar, how far down toward the edge a medal stands on, and how far across to the side its face looks to. */
  const onRail = (frame: ReturnType<typeof railFrame>, point: { x: number; y: number; z: number }) => {
    const v: Spot = { x: point.x - frame.from.x, height: point.y - frame.from.height, depth: point.z - frame.from.depth };
    // The three directions are not quite square to one another, so the point is worked out from all three at once.
    const det = (a: Spot, b: Spot, c: Spot) => a.x * (b.height * c.depth - b.depth * c.height) - a.height * (b.x * c.depth - b.depth * c.x) + a.depth * (b.x * c.height - b.height * c.x);
    const whole = det(frame.along, frame.foot, frame.face);
    return { far: det(v, frame.foot, frame.face) / whole, down: det(frame.along, v, frame.face) / whole, across: det(frame.along, frame.foot, v) / whole };
  };

  it('runs each rail from its slot to its tip, wherever the tip is: a thin channel with a medal\u2019s edge in it', () => {
    fakeDocument();
    for (const tips of [
      [20, 80],
      [36, 64],
      [9, 55],
    ] as [number, number][]) {
      const { solid, machine } = moving(1, 50, undefined, tips);
      // The rails have a run of their own: five strips each, the left arm's first.
      const rails = corners(solid, MOVING_PARTS[2].first, MOVING_PARTS[2].count);
      expect(rails).toHaveLength(2 * 5 * 6);
      for (const arm of [0, 1] as const) {
        const frame = railFrame(arm, armTipAt(machine, arm));
        const own = rails.slice(arm * 30, arm * 30 + 30).map((corner) => onRail(frame, corner));
        // From where it comes out of the slot's body to a little past the tip.
        expect(Math.min(...own.map((at) => at.far))).toBeCloseTo(3, 3);
        expect(Math.max(...own.map((at) => at.far))).toBeCloseTo(frame.length + 0.6, 3);
        expect(3).toBeLessThan(4.2);
        // Its floor is under the edge a medal stands on; the wall the medal leans on and the tube of light along
        // the top of it come up behind the medal, but not as far as its middle.
        expect(Math.max(...own.map((at) => at.down))).toBeCloseTo(R, 4);
        expect(Math.min(...own.map((at) => at.down))).toBeGreaterThan(0);
        expect(Math.min(...own.map((at) => at.down))).toBeLessThan(R - 2);
        // Thin: wider than a medal is thick, so the medal stands in it, and much narrower than a medal is wide.
        const across = own.map((at) => at.across);
        expect(Math.max(...across) - Math.min(...across)).toBeGreaterThan(T);
        expect(Math.max(...across) - Math.min(...across)).toBeLessThan(R / 2);
        expect(Math.min(...across)).toBeCloseTo(-Math.max(...across), 4);
        // All of it is over the tables, higher than the tallest tower.
        for (const corner of rails.slice(arm * 30, arm * 30 + 30)) expect(corner.y).toBeGreaterThan(P + TOWER.max * T);
        // A medal anywhere on the rail has its edge on the floor, in the middle of the channel.
        for (const remaining of [FEED.arm, FEED.arm / 2, 0]) {
          const spot = rollingSpot(arm, armTipAt(machine, arm), remaining);
          const edge = onRail(frame, { x: spot.x + frame.foot.x * R, y: spot.height + frame.foot.height * R, z: spot.depth + frame.foot.depth * R });
          expect(edge.down).toBeCloseTo(R, 9);
          expect(edge.across).toBeCloseTo(0, 9);
          expect(edge.far).toBeGreaterThanOrEqual(-1e-9);
          expect(edge.far).toBeLessThanOrEqual(frame.length + 1e-9);
        }
      }
      // Under each rail is its shade: broader than the rail, just under its floor, and as long.
      const shades = corners(solid, MOVING_PARTS[3].first, MOVING_PARTS[3].count);
      expect(shades).toHaveLength(2 * 6);
      for (const arm of [0, 1] as const) {
        const frame = railFrame(arm, armTipAt(machine, arm));
        const own = shades.slice(arm * 6, arm * 6 + 6).map((corner) => onRail(frame, corner));
        expect(Math.max(...own.map((at) => at.across))).toBeGreaterThan(1.2);
        expect(Math.min(...own.map((at) => at.across))).toBeLessThan(-1.2);
        for (const at of own) expect(at.down).toBeGreaterThan(R);
        expect(Math.max(...own.map((at) => at.far))).toBeCloseTo(frame.length + 0.6, 3);
      }
    }
    // The pusher throws a shadow, and so do the rails, by way of the shades under them, which are not in the
    // picture, and the catcher that hangs on the pusher's front. Everything that casts comes first, in one stretch;
    // the slots and the catcher's apron are lights, and the hood over the catcher is not in the picture at all.
    expect(MOVING_CAST).toBe(5);
    expect(MOVING_HOOD).toBe(7);
    expect(MOVING_PARTS.map((part) => part.art)).toEqual(['pusher', 'plain', 'plain', 'plain', 'plain', 'plain', 'sign', 'plain']);
    expect(MOVING_PARTS.map((part) => part.unseen === true)).toEqual([false, false, false, true, false, false, false, true]);
    const { solid } = moving(1);
    let next = 0;
    for (const part of MOVING_PARTS) {
      expect(part.first).toBe(next);
      expect(part.count % 6).toBe(0);
      expect(part.count).toBeGreaterThan(0);
      next += part.count;
    }
    expect(next).toBe(solid.count);
    const pusher = corners(solid, 0, MOVING_PARTS[0].count + MOVING_PARTS[1].count);
    expect(Math.max(...pusher.map((corner) => corner.y))).toBe(P);
  });

  it('builds each slot as a funnel tipped back to look up at the player: a ring of light, a throat, and a dark mouth a medal plainly fits', () => {
    fakeDocument();
    /** The corners of each slot, and of the hatch's door, as the fittings were last built. */
    const fittings = (machine: Machine) => {
      const solid = new Solid(100);
      buildMoving(solid, machine, 40, createStage(1, false), { showGuide: false });
      const all = corners(solid, MOVING_PARTS[5].first, MOVING_PARTS[5].count);
      const slot = (arm: 0 | 1) => all.filter((corner) => corner.z > 100 && corner.x < FIELD.width / 2 === (arm === 0)).map((corner) => ({ ...corner, ...inSlot(arm, corner) }));
      const door = all.filter((corner) => corner.z < 10);
      return { all, slot, door };
    };
    /** Where a point is in a slot's own measures: across its face, up its face, and out the way it faces. */
    const inSlot = (arm: 0 | 1, point: { x: number; y: number; z: number }) => {
      const collar = armCollar(arm);
      const [sin, cos] = [Math.sin(SLOT.tilt), Math.cos(SLOT.tilt)];
      const [dy, dz] = [point.y - collar.height, point.z - collar.depth];
      return { across: point.x - collar.x, up: dy * cos - dz * sin, out: dy * sin + dz * cos };
    };
    const reach = (corner: { across: number; up: number }) => Math.hypot(corner.across, corner.up);
    const machine = createMachine(3);
    const idle = fittings(machine);
    expect(MOVING_PARTS[5].art).toBe('plain');
    expect(idle.all).toHaveLength(idle.slot(0).length + idle.slot(1).length + idle.door.length);
    for (const arm of [0, 1] as const) {
      const slot = idle.slot(arm);
      // Round, and a good deal wider than a medal: a ring out in front of the collar, and a body behind it that is
      // narrower at the back. It flares toward the player.
      expect(Math.max(...slot.map(reach))).toBeCloseTo(SLOT.ring, 3);
      const front = slot.filter((corner) => Math.abs(corner.out - SLOT.face) < 1e-3);
      const back = slot.filter((corner) => Math.abs(corner.out + SLOT.back) < 1e-3);
      expect(Math.max(...front.map(reach))).toBeCloseTo(SLOT.ring, 3);
      expect(Math.max(...back.map(reach))).toBeCloseTo(SLOT.waist, 3);
      expect(Math.min(...slot.map((corner) => corner.out))).toBeCloseTo(-SLOT.back, 3);
      expect(Math.max(...slot.map((corner) => corner.out))).toBeCloseTo(SLOT.face, 3);
      expect(SLOT.waist).toBeLessThan(SLOT.ring);
      expect(SLOT.ring).toBeGreaterThan(R * 1.5);
      // Its face is tipped back: the top of the ring is further from the player than the foot of it, and it is where `slotSpot` says.
      const top = slotSpot(arm, 0, SLOT.ring, SLOT.face);
      const foot = slotSpot(arm, 0, -SLOT.ring, SLOT.face);
      expect(top.depth).toBeLessThan(foot.depth - 2);
      expect(top.height).toBeGreaterThan(foot.height + R * 2);
      for (const spot of [top, foot]) expect(slot.some((corner) => Math.hypot(corner.x - spot.x, corner.y - spot.height, corner.z - spot.depth) < 1e-3)).toBe(true);
      expect(slotSpot(arm, 0, 0, 0)).toEqual(armCollar(arm));
      // The mouth: dark, mirroring nothing, set back inside the face, upright, a little taller than a medal is across
      // and getting on for four times as wide as one is thick.
      const mouth = slot.filter((corner) => corner.colour.every((value) => value === 0));
      expect(mouth).toHaveLength(9 * 6);
      for (const corner of mouth) {
        expect(corner.out).toBeCloseTo(SLOT.face - SLOT.deep, 3);
        expect(corner.gloss).toBe(0);
        expect(corner.glow).toBe(0);
      }
      const wide = Math.max(...mouth.map((corner) => corner.across)) - Math.min(...mouth.map((corner) => corner.across));
      const tall = Math.max(...mouth.map((corner) => corner.up)) - Math.min(...mouth.map((corner) => corner.up));
      // The dark of it is cut with a few flat sides, a hair inside the oval it stands for.
      expect(wide).toBeLessThanOrEqual(SLOT.mouth.wide);
      expect(wide).toBeGreaterThan(SLOT.mouth.wide * 0.98);
      expect(tall).toBeLessThanOrEqual(SLOT.mouth.tall);
      expect(tall).toBeGreaterThan(SLOT.mouth.tall * 0.98);
      expect(wide).toBeGreaterThan(T * 3.5);
      expect(wide).toBeLessThan(R * 2);
      expect(tall).toBeGreaterThan(R * 2);
      expect(tall).toBeLessThan(R * 2 + 1);
      expect(SLOT.deep).toBeGreaterThan(SLOT.face);
      // Between the ring of light and the mouth, the throat: it narrows from the one to the bright edge of the other.
      const throat = slot.filter((corner) => corner.gloss === 0.5);
      expect(throat).toHaveLength(20 * 6);
      expect(Math.max(...throat.map(reach))).toBeCloseTo(SLOT.ring * SLOT.throat, 3);
      expect(Math.min(...throat.map((corner) => corner.out))).toBeCloseTo(SLOT.face - SLOT.deep, 3);
      expect(SLOT.ring * SLOT.throat).toBeGreaterThan(SLOT.mouth.tall / 2 + 0.3);
      // No piece of it comes to a point, so every corner faces some way, and the light has something to go by.
      for (const corner of slot) expect(Math.hypot(...corner.normal)).toBeCloseTo(1, 4);
      // A medal at the end of its way into the slot is inside the funnel, in front of the mouth: it is seen going in.
      expect(inSlot(arm, { x: armCollar(arm).x, y: armCollar(arm).height, z: armCollar(arm).depth }).out).toBeGreaterThan(SLOT.face - SLOT.deep);
      // The body is brushed, not mirror-bright.
      expect(back.every((corner) => corner.gloss > 0.3 && corner.gloss < 0.6)).toBe(true);
    }
    /** How bright the ring of light in a slot's face is, and what colour: its self-lit corners outside the throat. */
    const lights = (slot: ReturnType<typeof idle.slot>) => slot.filter((corner) => corner.gloss === 0 && corner.glow > 0 && reach(corner) > SLOT.ring * SLOT.throat + 1e-3);
    const ring = (slot: ReturnType<typeof idle.slot>) => Math.max(...lights(slot).map((corner) => corner.glow));
    // Either slot takes a medal at any moment, so the two rings glow alike, wherever the arms are pointed.
    expect(lights(idle.slot(0)).length).toBeGreaterThan(0);
    expect(ring(idle.slot(0))).toBe(ring(idle.slot(1)));
    expect(ring(idle.slot(0))).toBeGreaterThan(0);
    // While a medal is being taken in, that slot's ring is brighter, and another colour. The other slot's is as it was.
    dropAt(machine, 30);
    const taking = fittings(machine);
    expect(ring(taking.slot(0))).toBeGreaterThan(ring(idle.slot(0)));
    expect(ring(taking.slot(1))).toBe(ring(idle.slot(1)));
    expect(lights(taking.slot(0))[0].colour).not.toEqual(lights(idle.slot(0))[0].colour);
    expect(lights(taking.slot(1))[0].colour).toEqual(lights(idle.slot(1))[0].colour);
    // Once it is on the rail the ring goes back.
    step(machine, FEED.slot + 0.05);
    expect(ring(fittings(machine).slot(0))).toBe(ring(idle.slot(0)));
    // The door of the hatch is shut, glossy and coloured, until a ball is let go: then it stands open, dark, for a moment.
    expect(idle.door.length).toBeGreaterThan(50);
    expect(idle.door.every((corner) => corner.gloss > 0.5)).toBe(true);
    dropBall(machine);
    const open = fittings(machine).door;
    expect(open).toHaveLength(idle.door.length);
    expect(open.every((corner) => corner.gloss === 0)).toBe(true);
    expect(Math.max(...open.flatMap((corner) => corner.colour))).toBeLessThan(Math.max(...idle.door.flatMap((corner) => corner.colour)) / 4);
    step(machine, FALL_TIME * 0.8);
    expect(fittings(machine).door.every((corner) => corner.gloss > 0.5)).toBe(true);
  });

  it('lets both arms glow, and lights in full the one with a medal on its rail', () => {
    fakeDocument();
    /** How bright the bars of each arm are: the self-lit corners left and right of the middle, above the pusher. */
    const lit = (machine: Machine) => {
      machine.tips = [20, 80];
      const solid = new Solid(100);
      buildMoving(solid, machine, 40, createStage(1, false), { showGuide: true });
      const bars = corners(solid, MOVING_PARTS[2].first, MOVING_PARTS[2].count).filter((corner) => corner.glow > 0);
      const of = (left: boolean) => Math.max(...bars.filter((corner) => corner.x < 50 === left).map((corner) => corner.glow));
      return [of(true), of(false)];
    };
    const machine = createMachine(3);
    // With nothing on either rail the two glow alike: either can be fed at any moment, wherever it is pointed.
    const [left, right] = lit(machine);
    expect(left).toBe(right);
    expect(left).toBeGreaterThan(0);
    // A medal rolling down the left arm lights it in full. The right arm glows as before.
    dropAt(machine, 20);
    const [fed, other] = lit(machine);
    expect(fed).toBeGreaterThan(left);
    expect(other).toBe(right);
    // Both fed at once, both are lit.
    dropAt(machine, 80);
    expect(lit(machine)).toEqual([fed, fed]);
  });

  it('lays on the screen the shadow of whatever the machine lets go in front of it, and nothing of the arms', () => {
    fakeDocument();
    const machine = holding([]);
    const touches = () => {
      const flat = new Flat(600);
      buildTouches(flat, machine, 40, createStage(1, false), { showGuide: false });
      return flat;
    };
    /** The middle and the size of every round spot of dark laid just off the wall: each is six corners, the first and the third opposite. */
    const spots = (flat: Flat) => {
      const found: { x: number; y: number; size: number; cover: number }[] = [];
      for (let at = 0; at < flat.count * FLAT_STRIDE; at += 6 * FLAT_STRIDE) {
        const opposite = at + 2 * FLAT_STRIDE;
        if (flat.data[at + 10] !== SHAPE.spot || flat.data[at + 6] < 0.1 || flat.data[at + 2] > 0.1) continue;
        found.push({ x: (flat.data[at] + flat.data[opposite]) / 2, y: (flat.data[at + 1] + flat.data[opposite + 1]) / 2, size: Math.abs(flat.data[opposite] - flat.data[at]) / 2, cover: flat.data[at + 6] });
      }
      return found;
    };
    const empty = touches();
    expect(spots(empty)).toEqual([]);
    // A medal on a rail lays nothing on the wall. The rails are out over the tables, and what they shade there is the lamp's doing.
    aimBoth(machine, 30);
    dropAt(machine, 30);
    step(machine, FEED.slot + 0.3);
    expect(machine.rolling).toHaveLength(1);
    expect(touches().count).toBe(empty.count);
    step(machine, ROLL_TIME);
    expect(machine.falling.map((medal) => medal.source)).toEqual(['player']);
    expect(spots(touches())).toEqual([]);
    step(machine, FALL_TIME);
    // A medal the machine pays, half way down in front of the screen: one round spot of dark on the glass, down and to the right of it.
    const paid = { id: 900, x: 40, y: 10, level: 1 as const, fromX: 40, fromY: RELEASE.depth, rank: 0, ball: false, remaining: FALL_TIME * 0.5, duration: FALL_TIME, source: 'payout' as const };
    machine.falling = [paid];
    const flat = touches();
    expect(flat.count).toBe(empty.count + 6);
    const [shadow] = spots(flat);
    const at = airSpot(paid, LANDED);
    expect(at.height).toBeGreaterThan(SCREEN.foot);
    expect(shadow.x).toBeGreaterThan(at.x);
    expect(shadow.x - at.x).toBeLessThan(R * 2);
    expect(shadow.y).toBeLessThan(at.height);
    expect(at.height - shadow.y).toBeLessThan(R * 3);
    // A little bigger than the medal, and soft.
    expect(shadow.size).toBeGreaterThan(R);
    expect(shadow.size).toBeLessThan(R * 2);
    expect(shadow.cover).toBeLessThan(0.5);
    // A ball throws a bigger and darker one, from the hatch on down.
    machine.falling = [{ ...paid, ball: true, remaining: FALL_TIME * 0.6 }];
    const [round] = spots(touches());
    expect(round.size).toBeGreaterThan(BALL_RADIUS);
    expect(round.cover).toBeGreaterThan(shadow.cover);
    // By the time either is down past the shelf it is over the heap, and there is nothing of it on the glass.
    machine.falling = [{ ...paid, remaining: FALL_TIME * 0.05 }];
    expect(spots(touches())).toEqual([]);
    // While the ball has only just left, the hatch behind it is open and glows.
    machine.falling = [{ ...paid, ball: true, remaining: FALL_TIME * 0.9 }];
    const glowing = touches();
    machine.falling = [{ ...paid, ball: true, remaining: FALL_TIME * 0.2 }];
    expect(glowing.count - touches().count).toBeGreaterThanOrEqual(0);
  });

  it('lays a shade under the hood on the top of the screen and two bands of light across the glass, every frame', () => {
    fakeDocument();
    const flat = new Flat(600);
    buildTouches(flat, holding([]), 40, createStage(1, false), { showGuide: false });
    const onGlass: { xs: number[]; ys: number[]; cover: number; shine: number }[] = [];
    for (let at = 0; at < flat.count * FLAT_STRIDE; at += 6 * FLAT_STRIDE) {
      const cornersOf = [0, 1, 2, 5].map((corner) => at + corner * FLAT_STRIDE);
      if (cornersOf.some((corner) => Math.abs(flat.data[corner + 2]) > 0.06)) continue;
      const ys = cornersOf.map((corner) => flat.data[corner + 1]);
      if (Math.min(...ys) < SCREEN.foot) continue;
      onGlass.push({ xs: cornersOf.map((corner) => flat.data[corner]), ys, cover: flat.data[at + 6], shine: flat.data[at + 7] });
    }
    expect(onGlass).toHaveLength(3);
    for (const touch of onGlass) {
      // Each is inside the opening: it is the page's screen it shades or lights.
      expect(Math.min(...touch.xs)).toBeGreaterThanOrEqual(SCREEN.left + HOUSING.lap - 1e-4);
      expect(Math.max(...touch.xs)).toBeLessThanOrEqual(SCREEN.right - HOUSING.lap + 1e-4);
      expect(Math.max(...touch.ys)).toBeLessThanOrEqual(SCREEN.top - HOUSING.lap + 1e-4);
    }
    const [shade, ...bands] = onGlass;
    expect(shade.cover).toBeGreaterThan(0.3);
    expect(Math.min(...shade.ys)).toBeGreaterThan(SCREEN.top - 12);
    // The bands are light only, faint, and slant across the glass from top to foot.
    for (const band of bands) {
      expect(band.cover).toBe(0);
      expect(band.shine).toBeGreaterThan(0);
      expect(band.shine).toBeLessThan(0.1);
      expect(Math.max(...band.ys) - Math.min(...band.ys)).toBeGreaterThan(50);
      expect(band.xs[0]).not.toBeCloseTo(band.xs[3], 0);
    }
  });

  it('hangs the catcher on the front of the pusher: a slide that leans down toward the player, with three slots in it, a frame, a ring of light, a throat and two wings to each, and the strip with the words', () => {
    fakeDocument();
    type Corner = ReturnType<typeof corners>[number];
    const bright = (list: Corner[]) => Math.max(...list.flatMap((corner) => corner.colour));
    const sin = Math.sin(SLOPE.angle);
    const cos = Math.cos(SLOPE.angle);
    const { ring } = SLOT_SHAPE;
    const wordsFrom = CATCHER.back + START_SLOT.long + CATCHER.rim.wide;
    for (const time of [0, 0.9, 2.2, 4.5]) {
      const { solid } = moving(time);
      const front = pusherFront(time);
      const catcher = corners(solid, MOVING_PARTS[4].first, MOVING_PARTS[4].count);
      const apron = corners(solid, MOVING_PARTS[6].first, MOVING_PARTS[6].count);
      /** Where a corner is against the slide: how far down it from the lip, and how far clear of it, square to it. */
      const against = (corner: Corner) => ({ down: (corner.z - front) * cos - (corner.y - CATCHER.deck) * sin, clear: (corner.y - CATCHER.deck) * cos + (corner.z - front) * sin });
      /** Whether a surface faces the way the slide does: up, and toward the player by as much as the slide leans. */
      const facesAsSlide = (corner: Corner) => Math.abs(corner.normal[0]) < 1e-4 && Math.abs(corner.normal[1] - cos) < 1e-4 && Math.abs(corner.normal[2] - sin) < 1e-4;
      // All of it is out in front of the lip, within its own length, no lower than its foot and no higher than a wing stands off the top of the slide; and every piece of it faces some way.
      for (const corner of catcher) {
        expect(corner.x).toBeGreaterThanOrEqual(CATCHER.from - 1e-4);
        expect(corner.x).toBeLessThanOrEqual(CATCHER.to + 1e-4);
        expect(corner.z).toBeGreaterThanOrEqual(front - 1e-4);
        expect(corner.z).toBeLessThanOrEqual(front + CATCHER.foot.out + 1e-4);
        expect(corner.y).toBeGreaterThanOrEqual(CATCHER.foot.height - 1e-4);
        expect(corner.y).toBeLessThanOrEqual(CATCHER.deck + START_SLOT.wing.high + 1e-4);
        expect(Math.hypot(...corner.normal)).toBeCloseTo(1, 4);
      }
      mouthSpots(time).forEach((spot, pocket) => {
        // What is the slot's own: every surface that is wholly within its stretch of the catcher.
        const own = catcher.filter((_corner, at) => catcher.slice(at - (at % 6), at - (at % 6) + 6).every((other) => Math.abs(other.x - spot.x) <= CATCHER.tile / 2 + 1e-4));
        const off = (corner: Corner) => Math.abs(corner.x - spot.x);
        // Its stretch of the slide leans as the slide does, brushed steel, from the lip down to where the words begin and half
        // way to the next slot on either side: four pieces, round the opening, and none of them over it.
        const board = own.filter((corner) => Math.abs(against(corner).clear) < 1e-4 && corner.gloss === Math.fround(MATERIAL.brushedSteel.gloss) && facesAsSlide(corner));
        expect(board).toHaveLength(4 * 6);
        expect(board.every((corner) => corner.glow === MATERIAL.brushedSteel.glow)).toBe(true);
        expect(Math.min(...board.map((corner) => against(corner).down))).toBeCloseTo(0, 4);
        expect(Math.max(...board.map((corner) => against(corner).down))).toBeCloseTo(wordsFrom, 4);
        expect(Math.min(...board.map((corner) => corner.x))).toBeCloseTo(spot.x - CATCHER.tile / 2, 4);
        expect(Math.max(...board.map((corner) => corner.x))).toBeCloseTo(spot.x + CATCHER.tile / 2, 4);
        const middle = CATCHER.back + START_SLOT.long / 2;
        for (let piece = 0; piece < board.length; piece += 6) {
          const six = board.slice(piece, piece + 6);
          const across = Math.min(...six.map((corner) => corner.x)) < spot.x && Math.max(...six.map((corner) => corner.x)) > spot.x;
          const along = Math.min(...six.map((corner) => against(corner).down)) < middle && Math.max(...six.map((corner) => against(corner).down)) > middle;
          expect(across && along).toBe(false);
        }
        // It is darker under the lip and lighter toward its foot.
        const shade = (down: number) => bright(board.filter((corner) => Math.abs(against(corner).down - down) < 1e-4));
        expect(shade(wordsFrom)).toBeGreaterThan(shade(0));
        // The frame stands up out of the slide all round the opening, which is as wide as a medal that just fits and shorter down the slide than a medal is across.
        const top = own.filter((corner) => Math.abs(against(corner).clear - CATCHER.rim.high) < 1e-4 && facesAsSlide(corner));
        expect(top).toHaveLength(4 * 6);
        expect(Math.min(...top.map(off))).toBeCloseTo(slotHalf(), 4);
        expect(Math.max(...top.map(off))).toBeCloseTo(slotHalf() + CATCHER.rim.wide, 4);
        expect(Math.min(...top.map((corner) => against(corner).down))).toBeCloseTo(CATCHER.back - CATCHER.rim.wide, 4);
        expect(Math.max(...top.map((corner) => against(corner).down))).toBeCloseTo(wordsFrom, 4);
        // It is brass: bright trim, with no light of its own while its slot waits, and lit while the lucky lamp is on it.
        const lucky = litSlots(time)[pocket];
        expect(top.every((corner) => corner.gloss === Math.fround(MATERIAL.brass.gloss))).toBe(true);
        expect(top.every((corner) => (lucky ? corner.glow > 0.8 : corner.glow === MATERIAL.brass.glow))).toBe(true);
        // A frame that waits is a bright one all the same: every corner of its top is at least four fifths as bright as paint gets.
        if (!lucky) expect(Math.min(...top.map((corner) => Math.max(...corner.colour)))).toBeGreaterThan(0.8);
        // Inside the frame a ring of light slopes in and down, and gives off its own light: its own colour, or gold on the slot the lucky lamp is on.
        const onRing = (corner: Corner) => Math.abs(against(corner).clear - CATCHER.rim.high) < 1e-4 || Math.abs(against(corner).clear + ring.down) < 1e-4;
        const glowing = own.filter((corner, at) => corner.gloss === 0 && corner.glow > 0 && own.slice(at - (at % 6), at - (at % 6) + 6).every(onRing));
        expect(glowing).toHaveLength(4 * 6);
        const inner = glowing.filter((corner) => against(corner).clear < 0);
        expect(Math.max(...inner.map(off))).toBeCloseTo(slotHalf() - ring.in, 4);
        expect(Math.min(...inner.map((corner) => against(corner).down))).toBeCloseTo(CATCHER.back + ring.in, 4);
        expect(Math.max(...inner.map((corner) => against(corner).down))).toBeCloseTo(CATCHER.back + START_SLOT.long - ring.in, 4);
        expect(glowing[0].colour).toEqual([...(lucky ? light(SLOT_LIGHT.flash, 1.7) : light(SLOT_LIGHT.own[pocket], 1.4))].map(Math.fround));
        // Under it the throat goes straight down to its floor, which is level and all inside the opening: black in a slot that waits, and lit gold in the one the lucky lamp is on.
        const floor = own.filter((corner) => Math.abs(corner.y - CATCHER.throat) < 1e-4 && corner.normal[1] > 0.999);
        expect(floor).toHaveLength(6);
        if (lucky) expect(Math.min(...floor.map((corner) => Math.max(...corner.colour) * corner.glow))).toBeGreaterThan(0.2);
        else expect(bright(floor)).toBe(0);
        expect(Math.max(...floor.map(off))).toBeCloseTo(slotHalf() - ring.in, 4);
        expect(Math.max(...inner.map((corner) => corner.y)) - CATCHER.throat).toBeGreaterThan(T * 2);
        expect(Math.min(...inner.map((corner) => corner.y)) - CATCHER.throat).toBeGreaterThan(0);
        // Its walls stand upright. The far one, under the upper end of the opening, is the one the player sees down the slot, and it catches the light of the ring: it is the brightest of them.
        const wall = own.filter((corner) => Math.abs(corner.normal[1]) < 1e-3 && off(corner) < slotHalf() - ring.in + 1e-4);
        expect(wall).toHaveLength(4 * 6);
        const farEnd = Math.min(...wall.map((corner) => corner.z));
        const far = wall.filter((corner, at) => wall.slice(at - (at % 6), at - (at % 6) + 6).every((other) => Math.abs(other.z - farEnd) < 1e-3));
        expect(far).toHaveLength(6);
        const sides = wall.filter((corner) => !far.includes(corner));
        /** How much light a corner gives off: how bright its colour is, by how much of that is its own light. */
        const shine = (corner: Corner) => Math.max(...corner.colour) * corner.glow;
        expect(Math.max(...far.map(shine))).toBeGreaterThan(Math.max(...sides.map(shine)) * 1.3);
        // In a slot that waits the light is gone by the floor: the foot of every wall is black. The lucky lamp's gold fills the throat of its slot, down to the floor: no wall of it is dark anywhere.
        const feet = wall.filter((corner) => Math.abs(corner.y - CATCHER.throat) < 1e-4);
        expect(feet.length).toBeGreaterThanOrEqual(8);
        if (lucky) expect(Math.min(...wall.map(shine))).toBeGreaterThan(0.2);
        else expect(Math.max(...feet.map((corner) => Math.max(...corner.colour)))).toBe(0);
        // Its two wings are low fences on the slide, lying along the sides of the frame: as long as the frame, against it, and higher than it.
        const fence = own.filter((corner) => Math.abs(against(corner).clear - START_SLOT.wing.high) < 1e-4 && facesAsSlide(corner));
        expect(fence).toHaveLength(2 * 6);
        // Brass too, with no light of their own while they are folded.
        expect(fence.every((corner) => corner.gloss === Math.fround(MATERIAL.brass.gloss) && corner.glow === MATERIAL.brass.glow)).toBe(true);
        expect(Math.min(...fence.map(off))).toBeCloseTo(slotHalf() + CATCHER.rim.wide, 4);
        expect(Math.max(...fence.map(off))).toBeCloseTo(slotHalf() + CATCHER.rim.wide + START_SLOT.wing.thick, 4);
        expect(Math.min(...fence.map((corner) => against(corner).down))).toBeCloseTo(CATCHER.back - CATCHER.rim.wide, 4);
        expect(Math.max(...fence.map((corner) => against(corner).down))).toBeCloseTo(wordsFrom, 4);
        for (const side of [-1, 1]) {
          const cornersOfTop = wingCorners(pocket, side, time, false, START_SLOT.wing.high);
          for (const at of cornersOfTop) expect(fence.some((corner) => Math.hypot(corner.x - at.x, corner.y - at.height, corner.z - at.depth) < 1e-4)).toBe(true);
        }
        // Under the slot, its stretch of the strip with the words: as long as the slots are apart, on the slide, from under the frames down to the foot.
        const sign = apron.slice(pocket * 6, pocket * 6 + 6);
        const xs = sign.map((corner) => corner.x);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(spot.x, 4);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(CATCHER.tile, 4);
        for (const corner of sign) {
          const { down, clear } = against(corner);
          expect(clear).toBeCloseTo(0, 4);
          expect(facesAsSlide(corner)).toBe(true);
          // The picture is one for the whole strip: this stretch shows its own third of it, the top of it under the frames.
          expect(corner.u).toBeCloseTo((corner.x - CATCHER.from) / (CATCHER.to - CATCHER.from), 5);
          expect(corner.v).toBeCloseTo((down - wordsFrom) / APRON, 4);
          // It is lit from inside, so the words read whatever shadow falls on them.
          expect(corner.glow).toBeGreaterThanOrEqual(1);
        }
        expect(Math.min(...sign.map((corner) => against(corner).down))).toBeCloseTo(wordsFrom, 4);
        expect(Math.max(...sign.map((corner) => against(corner).down))).toBeCloseTo(SLOPE.long, 4);
        expect(Math.min(...sign.map((corner) => corner.y))).toBeCloseTo(CATCHER.foot.height, 4);
      });
      expect(apron).toHaveLength(6 * CHUCKERS.count);
      expect(MOVING_PARTS[6].art).toBe('sign');
      // No rail and no level deck: nothing of it is level but the floors of the throats and the underside, which is at the height of its foot from the lip out and throws its shadow.
      const level = catcher.filter((corner) => Math.abs(corner.normal[1]) > 0.999);
      expect(level.filter((corner) => Math.abs(corner.y - CATCHER.throat) > 1e-4 && Math.abs(corner.y - CATCHER.foot.height) > 1e-4)).toEqual([]);
      const under = level.filter((corner) => Math.abs(corner.y - CATCHER.foot.height) < 1e-4);
      expect(under).toHaveLength(6);
      expect(Math.min(...under.map((corner) => corner.z))).toBeCloseTo(front, 4);
      expect(Math.max(...under.map((corner) => corner.z))).toBeCloseTo(front + CATCHER.foot.out, 4);
      // Its two ends are closed, from the slide down to that level, in the slide's own steel.
      for (const x of [CATCHER.from, CATCHER.to]) {
        const end = catcher.filter((corner) => Math.abs(Math.abs(corner.normal[0]) - 1) < 1e-4 && Math.abs(corner.x - x) < 1e-4);
        expect(end).toHaveLength(6);
        expect(end.every((corner) => corner.gloss === Math.fround(MATERIAL.brushedSteel.gloss) && corner.glow === 0)).toBe(true);
        expect(Math.max(...end.map((corner) => corner.y))).toBeCloseTo(CATCHER.deck, 4);
        expect(Math.min(...end.map((corner) => corner.y))).toBeCloseTo(CATCHER.foot.height, 4);
      }
      // The hood over it is not in the picture: four surfaces from its foot up past the top of a ball, over all of it.
      const hood = corners(solid, MOVING_PARTS[MOVING_HOOD].first, MOVING_PARTS[MOVING_HOOD].count);
      expect(hood).toHaveLength(4 * 6);
      expect(MOVING_PARTS[MOVING_HOOD].unseen).toBe(true);
      expect(Math.max(...hood.map((corner) => corner.y))).toBeCloseTo(CATCHER.hood, 4);
      expect(Math.min(...hood.map((corner) => corner.y))).toBeCloseTo(CATCHER.foot.height, 4);
      expect([Math.min(...hood.map((corner) => corner.x)), Math.max(...hood.map((corner) => corner.x))]).toEqual([CATCHER.from, CATCHER.to]);
      expect(Math.min(...hood.map((corner) => corner.z))).toBeCloseTo(front, 4);
      expect(Math.max(...hood.map((corner) => corner.z))).toBeCloseTo(front + CATCHER.foot.out, 4);
      expect(CATCHER.hood).toBeGreaterThan(BALL_RADIUS * 2);
    }
    // The strip with the words is as long down the slide as the catcher says: what is left of it under the frames.
    expect(APRON).toBeCloseTo(SLOPE.long - wordsFrom, 12);
  });

  it('lights the slot the lucky lamp is on gold, all three with the wings open, and a slot a medal has just dropped through brighter still, all the way down', () => {
    fakeDocument();
    type Corner = ReturnType<typeof corners>[number];
    const bright = (list: Corner[]) => Math.max(...list.flatMap((corner) => corner.colour));
    const sin = Math.sin(SLOPE.angle);
    const cos = Math.cos(SLOPE.angle);
    // One machine for all of it: only its clock is moved.
    const machine = createMachine(3);
    /** The catcher of the machine at `time`, as it is built with these options on this stage. */
    const built = (time: number, options: Partial<DrawOptions> = {}, stage: Stage = createStage(1, false)) => {
      machine.time = time;
      const solid = new Solid(100);
      buildMoving(solid, machine, pusherFront(time), stage, { showGuide: false, calm: true, ...options });
      return { solid, front: pusherFront(time) };
    };
    /** The corners of one slot's own stretch of the catcher, and among them the top of its frame, the top of its wings and the floor of its throat. */
    const of = ({ solid, front }: ReturnType<typeof built>, pocket: number) => {
      const own = corners(solid, MOVING_PARTS[4].first, MOVING_PARTS[4].count).filter((corner) => Math.abs(corner.x - CHECKERS.positions[pocket]) < CATCHER.tile / 2 - 1e-3 && corner.y > CATCHER.foot.height + 1e-3);
      const clear = (corner: Corner) => (corner.y - CATCHER.deck) * cos + (corner.z - front) * sin;
      const facing = (corner: Corner) => Math.abs(corner.normal[1] - cos) < 1e-4 && Math.abs(corner.normal[2] - sin) < 1e-4;
      return {
        own,
        frame: own.filter((corner) => Math.abs(clear(corner) - CATCHER.rim.high) < 1e-4 && facing(corner)),
        wings: own.filter((corner) => Math.abs(clear(corner) - START_SLOT.wing.high) < 1e-4 && facing(corner)),
        floor: own.filter((corner) => Math.abs(corner.y - CATCHER.throat) < 1e-4 && corner.normal[1] > 0.999),
      };
    };
    const glowOf = (list: Corner[]) => Math.max(...list.map((corner) => corner.glow));
    const reach = (list: Corner[], pocket: number) => Math.max(...list.map((corner) => Math.abs(corner.x - CHECKERS.positions[pocket])));
    // One slot's frame glows gold at a time: the one the engine says, which steps along with every stroke of the pusher.
    for (let stroke = 0; stroke <= CHUCKERS.count; stroke++) {
      const time = (stroke + 0.3) * LUCKY.dwell;
      const catcher = built(time);
      const lucky = luckySlot(time);
      expect(lucky).toBe(stroke % CHUCKERS.count);
      for (let pocket = 0; pocket < CHUCKERS.count; pocket++) {
        const { frame, floor } = of(catcher, pocket);
        expect(frame).toHaveLength(4 * 6);
        if (pocket === lucky) expect(glowOf(frame)).toBeGreaterThan(0.8);
        else expect(glowOf(frame)).toBeLessThan(0.2);
        // The gold fills the mouth of the slot it is on, down to the floor of its throat, steadily, not as brightly as a
        // medal going down lights it; the floor of a slot that waits is black.
        expect(floor).toHaveLength(6);
        if (pocket === lucky) {
          expect(floor.every((corner) => corner.gloss === 0 && corner.glow === Math.fround(THROAT_FILL))).toBe(true);
          expect(Math.min(...floor.map((corner) => Math.max(...corner.colour)))).toBeGreaterThan(0.3);
          // Gold: a good deal more red than blue in every corner of it.
          expect(floor.every((corner) => corner.colour[0] > corner.colour[2] * 3)).toBe(true);
        } else expect(bright(floor)).toBe(0);
      }
      expect(THROAT_FILL).toBeGreaterThan(0.5);
      expect(THROAT_FILL).toBeLessThan(1);
      // It is the same on a stage whose clock has run on, with motion: the lit slot is steady. One that waits is not: its ring glows more and less.
      const later = createStage(1, false);
      later.clock = 7.3;
      const waiting = (lucky + 1) % CHUCKERS.count;
      expect(of(built(time, { calm: false }, later), lucky).own).toEqual(of(built(time, { calm: false }), lucky).own);
      expect(of(built(time, { calm: false }, later), waiting).own).not.toEqual(of(built(time, { calm: false }), waiting).own);
      expect(of(built(time, {}, later), waiting).own).toEqual(of(catcher, waiting).own);
    }
    // With the wings open all three are gold, their openings are wider, and each wing has swung out from the slot at its upper end.
    const time = 1.1;
    const folded = built(time);
    const open = built(time, { wings: true });
    expect(built(time, { wings: false }).solid.data.slice(0, folded.solid.count * SOLID_STRIDE)).toEqual(folded.solid.data.slice(0, folded.solid.count * SOLID_STRIDE));
    for (let pocket = 0; pocket < CHUCKERS.count; pocket++) {
      const narrow = of(folded, pocket);
      const wide = of(open, pocket);
      expect(glowOf(wide.frame)).toBeGreaterThan(0.8);
      expect(reach(narrow.frame, pocket)).toBeCloseTo(slotHalf() + CATCHER.rim.wide, 4);
      expect(reach(wide.frame, pocket)).toBeCloseTo(slotHalf(true) + CATCHER.rim.wide, 4);
      expect(reach(narrow.wings, pocket)).toBeCloseTo(slotHalf() + CATCHER.rim.wide + START_SLOT.wing.thick, 4);
      expect(reach(wide.wings, pocket)).toBeCloseTo(slotHalf(true) + CATCHER.rim.wide + START_SLOT.wing.out + START_SLOT.wing.thick, 4);
      // Each open wing is where the catcher has it, corner for corner, and gold.
      expect(wide.wings).toHaveLength(2 * 6);
      for (const side of [-1, 1]) {
        for (const at of wingCorners(pocket, side, time, true, START_SLOT.wing.high)) expect(wide.wings.some((corner) => Math.hypot(corner.x - at.x, corner.y - at.height, corner.z - at.depth) < 1e-4)).toBe(true);
      }
      expect(glowOf(wide.wings)).toBeGreaterThan(glowOf(narrow.wings) + 0.5);
    }
    // A slot a medal has just dropped through is brighter still, all the way down, and its stretch of the strip of words lights up. No other does.
    const stage = createStage(1, false);
    const gate = (luckySlot(time) + 1) % CHUCKERS.count;
    const other = (luckySlot(time) + 2) % CHUCKERS.count;
    lightGate(stage, gate);
    const lit = built(time, {}, stage);
    expect(glowOf(of(lit, gate).frame)).toBeGreaterThan(glowOf(of(folded, gate).frame) * 2);
    expect(glowOf(of(lit, gate).frame)).toBeGreaterThan(glowOf(of(folded, luckySlot(time)).frame));
    expect(bright(of(folded, gate).floor)).toBe(0);
    expect(bright(of(lit, gate).floor)).toBeGreaterThan(0.5);
    // Brighter than the lucky lamp's steady gold: its floor gives off all of its colour.
    expect(glowOf(of(lit, gate).floor)).toBe(1);
    expect(glowOf(of(lit, gate).floor)).toBeGreaterThan(glowOf(of(folded, luckySlot(time)).floor));
    expect(of(lit, other).own).toEqual(of(folded, other).own);
    expect(of(lit, luckySlot(time)).own).toEqual(of(folded, luckySlot(time)).own);
    const sign = ({ solid }: ReturnType<typeof built>, pocket: number) => corners(solid, MOVING_PARTS[6].first + pocket * 6, 1)[0].glow;
    expect(sign(lit, gate)).toBeGreaterThan(sign(folded, gate));
    expect(sign(lit, other)).toBe(sign(folded, other));
  });

  it('lays the dark under the lip on the catcher’s slide, glows steadily over the slot that is lit gold, and flashes over a slot a medal has just gone down and on the words under it', () => {
    fakeDocument();
    const machine = createMachine(3);
    const stage = createStage(1, false);
    const touches = (wings = false, calm = true) => {
      const flat = new Flat(600);
      buildTouches(flat, machine, pusherFront(machine.time), stage, { showGuide: false, calm, wings });
      return flat;
    };
    /** Every touch as its middle, how far it reaches, and what it does. */
    const all = (flat: Flat) => {
      const found: { x: number; y: number; z: number; ys: number[]; shape: number; cover: number; shine: number }[] = [];
      for (let i = 0; i < flat.count * FLAT_STRIDE; i += 6 * FLAT_STRIDE) {
        const opposite = i + 2 * FLAT_STRIDE;
        found.push({ x: (flat.data[i] + flat.data[opposite]) / 2, y: (flat.data[i + 1] + flat.data[opposite + 1]) / 2, z: (flat.data[i + 2] + flat.data[opposite + 2]) / 2, ys: [flat.data[i + 1], flat.data[opposite + 1]], shape: flat.data[i + 10], cover: flat.data[i + 6], shine: flat.data[i + 7] });
      }
      return found;
    };
    /** How far down the slide from the lip the middle of a touch is. */
    const down = (touch: { y: number; z: number }) => (touch.z - pusherFront(machine.time)) * Math.cos(SLOPE.angle) - (touch.y - CATCHER.deck) * Math.sin(SLOPE.angle);
    /** The touches over one slot: round, with their middle over the middle of its opening, just clear of the top of its frame. */
    const over = (flat: Flat, pocket: number) => {
      const spot = mouthSpot(pocket, machine.time);
      return all(flat).filter((touch) => touch.shape === SHAPE.spot && Math.abs(touch.x - spot.x) < 1e-3 && Math.abs(touch.z - spot.depth) < 0.5 && Math.abs(touch.y - spot.height) < CATCHER.rim.high + 0.3);
    };
    /** The light on one slot's stretch of the strip with the words. */
    const onWords = (flat: Flat, pocket: number) => all(flat).filter((touch) => touch.shape === SHAPE.spot && Math.abs(touch.x - CHECKERS.positions[pocket]) < 1e-3 && down(touch) > SLOPE.long - APRON && down(touch) < SLOPE.long);
    const idle = touches();
    const front = pusherFront(machine.time);
    const lucky = luckySlot(machine.time);
    // The slide is dark where it goes in under the lip, all along the catcher, and the dark fades out down it.
    const shade = all(idle).filter((touch) => touch.cover > 0.4 && Math.abs(touch.ys[0] - CATCHER.deck) < 0.1 && Math.abs(touch.x - (CATCHER.from + CATCHER.to) / 2) < 1e-3);
    expect(shade).toHaveLength(1);
    expect(shade[0].z).toBeGreaterThan(front);
    expect(down(shade[0])).toBeLessThan(CATCHER.back + START_SLOT.long);
    expect(shade[0].ys[1]).toBeLessThan(shade[0].ys[0]);
    // Over the slot the lucky lamp is on there is a glow, light only, and a fainter one on the words under it. Nothing glows over a slot that waits: its light is its ring's and its lamp's own.
    for (let pocket = 0; pocket < CHUCKERS.count; pocket++) {
      expect(over(idle, pocket)).toHaveLength(pocket === lucky ? 1 : 0);
      expect(onWords(idle, pocket)).toHaveLength(pocket === lucky ? 1 : 0);
    }
    const [steady] = over(idle, lucky);
    expect(steady.cover).toBe(0);
    expect(steady.shine).toBeGreaterThan(0.2);
    expect(onWords(idle, lucky)[0].shine).toBeLessThan(steady.shine);
    // It is steady: the same, with motion, on a stage whose clock has run on.
    const before = over(touches(false, false), lucky);
    stage.clock = 9.7;
    expect(over(touches(false, false), lucky)).toEqual(before);
    expect(before).toEqual(over(idle, lucky));
    // With the wings open all three glow so.
    const open = touches(true);
    for (let pocket = 0; pocket < CHUCKERS.count; pocket++) {
      expect(over(open, pocket)).toHaveLength(1);
      expect(onWords(open, pocket)).toHaveLength(1);
    }
    const gate = (lucky + 1) % CHUCKERS.count;
    const other = (lucky + 2) % CHUCKERS.count;
    lightGate(stage, gate);
    const lit = touches();
    // Two more touches: the flash over the slot, brighter than the steady glow, and the light on the words under it.
    expect(lit.count).toBe(idle.count + 12);
    const [flash] = over(lit, gate);
    expect(flash.cover).toBe(0);
    expect(flash.shine).toBeGreaterThan(steady.shine);
    expect(over(lit, other)).toEqual([]);
    expect(over(lit, lucky)).toHaveLength(1);
    const glow = onWords(lit, gate);
    expect(glow).toHaveLength(1);
    expect(glow[0].shine).toBeGreaterThan(0.2);
    expect(glow[0].y).toBeLessThan(mouthSpot(gate, machine.time).height);
    expect(glow[0].y).toBeGreaterThan(CATCHER.foot.height);
    expect(onWords(lit, other)).toEqual([]);
    // The catcher rides with the pusher: half a stroke on, the dark under the lip has moved out with it, and the flash has gone.
    machine.time = PUSHER.period / 2;
    ageStage(stage, 1);
    const later = touches();
    expect(luckySlot(machine.time)).toBe(lucky);
    expect(later.count).toBe(idle.count);
    expect(pusherFront(machine.time)).not.toBeCloseTo(front, 0);
    expect(all(later).filter((touch) => touch.cover > 0.4 && Math.abs(touch.ys[0] - CATCHER.deck) < 0.1 && touch.z > pusherFront(machine.time))).toHaveLength(1);
  });

  it('puts one lamp on the lower bar of each slot’s frame: in the slot’s own colour while it waits, and gold and bigger on the slot that is lit', () => {
    fakeDocument();
    const machine = createMachine(3);
    machine.time = 1.1;
    const stage = createStage(1, false);
    const lamps = (wave: number, wings = false) => {
      const beads = createRows(BEAD_STRIDE, 4);
      addCatcherLamps(beads, machine, stage, wave, wings);
      return Array.from({ length: beads.count }, (_, index) => Array.from(beads.data.subarray(index * BEAD_STRIDE, (index + 1) * BEAD_STRIDE)));
    };
    const gold = [...light(SLOT_LIGHT.lamp)].map(Math.fround);
    const still = lamps(0);
    const lucky = luckySlot(machine.time);
    expect(still).toHaveLength(CHUCKERS.count);
    still.forEach(([x, y, z, radius, r, g, b, kind], pocket) => {
      // Where the catcher has the lamp: on the lower bar of the frame, in the middle. A bulb.
      const at = lampSpot(pocket, machine.time);
      expect([x, y, z]).toEqual([at.x, at.height, at.depth].map(Math.fround));
      expect(kind).toBeGreaterThanOrEqual(2);
      expect(kind).toBeLessThanOrEqual(3);
      if (pocket === lucky) {
        // Gold, a quarter bigger, and wholly lit.
        expect([r, g, b]).toEqual(gold);
        expect(radius).toBeCloseTo(START_SLOT.lamp.radius * 1.25, 5);
        expect(kind).toBe(BEAD.bulb(1));
      } else {
        // In the slot's own colour, as big as the catcher says, glowing a little.
        expect([r, g, b]).toEqual([...light(SLOT_LIGHT.own[pocket], 1.4)].map(Math.fround));
        expect(radius).toBeCloseTo(START_SLOT.lamp.radius, 5);
        expect(kind).toBeLessThan(BEAD.bulb(0.7));
        expect(kind).toBeGreaterThan(BEAD.bulb(0.1));
      }
    });
    // The glow of a lamp that waits moves on with the wave, and stands still when the wave does, as it does with reduced motion. The lit one is steady.
    const moved = lamps(1.3);
    moved.forEach((lamp, pocket) => {
      expect(lamp.slice(0, 7)).toEqual(still[pocket].slice(0, 7));
      if (pocket === lucky) expect(lamp[7]).toBe(still[pocket][7]);
      else expect(lamp[7]).not.toBe(still[pocket][7]);
    });
    expect(lamps(0)).toEqual(still);
    // The gold lamp steps along with the lucky lamp, a slot for every stroke of the pusher.
    for (let stroke = 0; stroke <= CHUCKERS.count; stroke++) {
      machine.time = (stroke + 0.3) * LUCKY.dwell;
      const golden = lamps(0).flatMap((lamp, pocket) => (lamp[4] === gold[0] && lamp[5] === gold[1] && lamp[6] === gold[2] ? [pocket] : []));
      expect(golden).toEqual([stroke % CHUCKERS.count]);
    }
    machine.time = 1.1;
    // With the wings open all three are gold and big.
    for (const lamp of lamps(0, true)) {
      expect(lamp.slice(4, 7)).toEqual(gold);
      expect(lamp[3]).toBeCloseTo(START_SLOT.lamp.radius * 1.25, 5);
      expect(lamp[7]).toBe(BEAD.bulb(1));
    }
    // A slot a medal has just dropped through has its lamp lit gold too. The others go on as they were.
    const gate = (lucky + 1) % CHUCKERS.count;
    lightGate(stage, gate);
    const lit = lamps(0);
    expect(lit[gate].slice(4, 7)).toEqual(gold);
    expect(lit[gate][3]).toBeCloseTo(START_SLOT.lamp.radius * 1.25, 5);
    expect(lit[gate][7]).toBe(BEAD.bulb(1));
    lit.forEach((lamp, pocket) => {
      if (pocket !== gate) expect(lamp).toEqual(still[pocket]);
    });
    // They are added to the bulbs that are already in the list.
    const beads = createRows(BEAD_STRIDE, 4);
    addCatcherLamps(beads, machine, stage, 0);
    addCatcherLamps(beads, machine, stage, 0);
    expect(beads.count).toBe(CHUCKERS.count * 2);
  });

  it('has the bulbs in their rows, the hold\u2019s lamps lit from the machine, a lamp at each arm\u2019s tip, and the studs', () => {
    fakeDocument();
    const machine = createMachine(3);
    aimBoth(machine, 30);
    step(machine, 0.5);
    const lamps = (stock: number, front = 40, wave = 1, partying = false) => {
      const beads = createRows(BEAD_STRIDE, 16);
      const flat = new Flat(16);
      buildLamps(beads, flat, machine, front, wave, partying, { showGuide: false, stock }, 0);
      const bead = (index: number) => Array.from(beads.data.subarray(index * BEAD_STRIDE, (index + 1) * BEAD_STRIDE));
      return { beads, flat, bead, kinds: Array.from({ length: beads.count }, (_, index) => beads.data[index * BEAD_STRIDE + 7]) };
    };
    const bulbs = LAMP_ROWS.hood + LAMP_ROWS.strip * 2 + LAMP_ROWS.rail * 2 + LAMP_ROWS.tray + LAMP_ROWS.face;
    const { beads, flat, bead, kinds } = lamps(3);
    expect(LAMP_ROWS.hold).toBe(8);
    expect(beads.count).toBe(bulbs + LAMP_ROWS.hold + 2 + STUDS);
    // Every bulb in a row lights the surface it is on, one round touch each; and so does each lamp of the hold that is lit.
    expect(flat.count).toBe((bulbs + 3) * 6);
    for (const kind of kinds.slice(0, bulbs)) {
      expect(kind).toBeGreaterThanOrEqual(2);
      expect(kind).toBeLessThanOrEqual(3);
    }
    // The glow travels: a third of a cycle from one bulb to the next, so every third bulb is as bright.
    expect(kinds[3]).toBeCloseTo(kinds[0], 5);
    expect(kinds[1]).not.toBeCloseTo(kinds[0], 2);
    // The first row is across the hood's face, on it, clear of the hatch; the next two are down the strips beside the screen.
    for (let i = 0; i < LAMP_ROWS.hood; i++) {
      const [x, y, z] = bead(i);
      expect(y).toBeGreaterThan(HOUSING.hood);
      expect(y).toBeLessThan(HEIGHT.top);
      expect(z).toBeGreaterThan(HOUSING.out);
      expect(Math.abs(x - HATCH.x)).toBeGreaterThan(HATCH.radius + 2);
    }
    for (let i = LAMP_ROWS.hood; i < LAMP_ROWS.hood + LAMP_ROWS.strip * 2; i++) {
      const [x, y] = bead(i);
      expect(x < SCREEN.left || x > SCREEN.right).toBe(true);
      expect(y).toBeGreaterThan(SCREEN.foot);
      expect(y).toBeLessThan(HOUSING.hood);
    }
    // The hold: eight lamps in a row on the front of the shelf, under the screen, as many lit as the machine holds spins, from the left.
    const hold = Array.from({ length: LAMP_ROWS.hold }, (_, i) => bead(bulbs + i));
    hold.forEach(([x, y, z, radius, , , , kind], i) => {
      expect(x).toBeCloseTo(HOLD_LAMPS.first + HOLD_LAMPS.step * i, 5);
      expect(y).toBeGreaterThan(HOUSING.shelf);
      expect(y).toBeLessThan(SCREEN.foot);
      expect(z).toBeGreaterThan(HOUSING.ledge);
      expect(radius).toBeCloseTo(HOLD_LAMPS.radius, 5);
      expect(kind).toBeCloseTo(i < 3 ? BEAD.bulb(1) : BEAD.bulb(0.03), 5);
    });
    expect(HOLD_LAMPS.step).toBeGreaterThan(HOLD_LAMPS.radius * 2);
    expect(hold[7][0] + HOLD_LAMPS.radius).toBeLessThan(SCREEN.right);
    expect(HOLD_LAMPS.label).toBeLessThan(HOLD_LAMPS.first - HOLD_LAMPS.radius);
    for (const [stock, lit] of [
      [0, 0],
      [8, 8],
      [11, 8],
    ]) {
      const other = lamps(stock);
      expect(other.kinds.slice(bulbs, bulbs + LAMP_ROWS.hold).filter((kind) => kind > 2.5)).toHaveLength(lit);
      expect(other.flat.count).toBe((bulbs + lit) * 6);
    }
    // A lamp at the far end of each rail marks where a medal will leave it. Both glow, since either arm can be fed
    // at any moment; one is at its brightest while a medal is on its rail.
    for (const arm of [0, 1] as const) {
      const [x, y, z, , , , , kind] = bead(bulbs + LAMP_ROWS.hold + arm);
      const tip = armTip(arm, machine.tips[arm]);
      expect(Math.hypot(x - tip.x, y - tip.height, z - tip.depth)).toBeLessThan(R + 1);
      expect(kind).toBeCloseTo(BEAD.bulb(REST_LIGHT), 5);
    }
    dropAt(machine, 30);
    const fed = lamps(0);
    const tipLamp = (arm: number) => fed.beads.data[(bulbs + LAMP_ROWS.hold + arm) * BEAD_STRIDE + 7];
    expect(tipLamp(0)).toBeCloseTo(BEAD.bulb(1), 5);
    expect(tipLamp(1)).toBeCloseTo(BEAD.bulb(REST_LIGHT), 5);
    machine.rolling = [];
    expect(kinds.slice(-STUDS)).toEqual(Array.from({ length: STUDS }, () => BEAD.stud));
    // With motion reduced the wave stands still at its start, and the pusher's bulbs still ride on its face.
    const calm = lamps(3, 31, 0);
    const again = lamps(3, 31, 0);
    expect(Array.from(calm.beads.data.subarray(0, calm.beads.count * BEAD_STRIDE))).toEqual(Array.from(again.beads.data.subarray(0, again.beads.count * BEAD_STRIDE)));
    const face = calm.bead(bulbs - 1);
    expect(face[2]).toBeGreaterThan(31);
    expect(face[2]).toBeLessThan(31.5);
    // A fever or a jackpot changes the colours of the running lamps and nothing else.
    const party = lamps(3, 31, 0, true);
    expect(party.beads.count).toBe(calm.beads.count);
    expect(party.bead(2).slice(4, 7)).not.toEqual(calm.bead(2).slice(4, 7));
    expect(party.bead(bulbs)).toEqual(calm.bead(bulbs));
  });

  it('hangs an aim guide from the tip of each arm, only when it is asked for', () => {
    fakeDocument();
    const machine = createMachine(3);
    const touches = (showGuide: boolean) => {
      const flat = new Flat(600);
      buildTouches(flat, machine, pusherFront(0), createStage(1, false), { showGuide });
      return flat;
    };
    /** Whether some touch has a corner at the foot of a medal at an arm's tip, this far across: out over the pusher, where the tip is. */
    const tipAt = (flat: Flat, x: number) =>
      Array.from({ length: flat.count }, (_, i) => i * FLAT_STRIDE).some(
        (at) => Math.abs(flat.data[at] - x) < 1e-4 && Math.abs(flat.data[at + 1] - (ARMS.tip - R)) < 1e-4 && Math.abs(flat.data[at + 2] - ARMS.depth) < 1e-4,
      );
    // The left arm is pointed further left and has not swung there yet: its guide hangs under its tip, where a medal
    // would leave now, and the right arm's hangs under the right arm's. Two guides, a wedge each.
    aimSide(machine, 30);
    const without = touches(false);
    const before = touches(true);
    expect(before.count - without.count).toBe(6);
    expect(machine.tips[0]).not.toBe(30);
    expect(tipAt(before, machine.tips[0])).toBe(true);
    expect(tipAt(before, machine.tips[1])).toBe(true);
    expect(tipAt(before, 30)).toBe(false);
    expect(tipAt(without, machine.tips[0])).toBe(false);
    expect(tipAt(without, machine.tips[1])).toBe(false);
    // Once the machine has swung the arm over its aim, its guide is over the aim too, and the other has not moved.
    step(machine, 1);
    const withGuide = touches(true);
    expect(machine.tips).toEqual([30, armStart(1)]);
    expect(tipAt(withGuide, 30)).toBe(true);
    expect(tipAt(withGuide, armStart(1))).toBe(true);
    // A touch either hides what is under it or adds light to it; its shape is one of the three.
    for (let i = 0; i < withGuide.count; i++) {
      const at = i * FLAT_STRIDE;
      expect(withGuide.data[at + 6]).toBeGreaterThanOrEqual(0);
      expect(withGuide.data[at + 6]).toBeLessThanOrEqual(1);
      expect(withGuide.data[at + 7]).toBeGreaterThanOrEqual(0);
      expect(Object.values(SHAPE)).toContain(withGuide.data[at + 10]);
    }
  });

  it('lights a jewel lamp for each jewel collected, a stone of two faces on the plate, and all five for a bonus', () => {
    fakeDocument();
    const machine = holding([]);
    const [, , , , , fittings] = MOVING_PARTS;
    /** The fittings as they are built with `lit` lamps lit: how many corners, and the corners of the lamps, which come last. */
    const built = (lit: number, stage: Stage = createStage(1, false), calm = false) => {
      const solid = new Solid(100);
      buildMoving(solid, machine, 40, stage, { showGuide: false, jewels: lit, calm });
      return { count: fittings.count, lamps: corners(solid, fittings.first, fittings.count) };
    };
    const none = built(0);
    for (let lit = 1; lit < JEWEL_LAMPS.count; lit++) {
      const { count, lamps } = built(lit);
      // Each lamp is two faces of four corners: the crown over the pavilion.
      expect(count).toBe(none.count + lit * 12);
      const added = lamps.slice(none.count);
      for (let lamp = 0; lamp < lit; lamp++) {
        const mine = added.slice(lamp * 12, lamp * 12 + 12);
        // On the front of the lower table, just proud of it, about its own place in the row, and lit from within.
        for (const corner of mine) {
          expect(corner.z).toBeGreaterThan(FIELD.depth);
          expect(corner.z).toBeLessThan(FIELD.depth + 0.2);
          expect(Math.abs(corner.x - jewelLampX(lamp))).toBeLessThanOrEqual(JEWEL_LAMPS.radius + 1e-4);
          expect(Math.abs(corner.y - JEWEL_LAMPS.height)).toBeLessThanOrEqual(JEWEL_LAMPS.radius + 1e-4);
          expect(corner.glow).toBeGreaterThan(0.5);
        }
        expect(Math.min(...mine.map((corner) => corner.y))).toBeCloseTo(JEWEL_LAMPS.height - JEWEL_LAMPS.radius, 4);
      }
    }
    // The one lit last shines brighter for a moment, and then as the others do.
    const stage = createStage(1, false);
    showJewel(stage, 1, 1, false);
    const fresh = built(2, stage).lamps.slice(none.count);
    expect(Math.max(...fresh.slice(12).map((corner) => corner.glow))).toBeGreaterThan(Math.max(...fresh.slice(0, 12).map((corner) => corner.glow)));
    ageStage(stage, 2);
    const settled = built(2, stage).lamps.slice(none.count);
    expect(Math.max(...settled.slice(12).map((corner) => corner.glow))).toBe(Math.max(...settled.slice(0, 12).map((corner) => corner.glow)));
    // A bonus has put the lamps out, and for its show all five are lit: steadily with reduced motion.
    showJewel(stage, JEWEL_LAMPS.count - 1, 3, true);
    expect(stage.jewelShow).toBe(JEWEL_SHOW);
    expect(built(0, stage, true).count).toBe(none.count + JEWEL_LAMPS.count * 12);
    expect(built(0, stage, false).count).toBe(none.count + JEWEL_LAMPS.count * 12);
    ageStage(stage, JEWEL_SHOW + 0.1);
    expect(built(0, stage).count).toBe(none.count);
  });

  it('lays a shadow with the stone\u2019s colour in it beside every jewel on a table, a glint on its table, and a glow on every lamp that is lit', () => {
    fakeDocument();
    const stage = createStage(1, false);
    const touches = (machine: Machine, lit: number, calm = true) => {
      const flat = new Flat(600);
      buildTouches(flat, machine, 40, stage, { showGuide: false, jewels: lit, calm });
      return flat.count;
    };
    const bare = touches(holding([]), 0);
    const one = holding([lying(1, 40, 70, 0, 0, { jewel: true })]);
    // A jewel on either table: the dark of its shadow, the rose light in it, and the glint on its table, a round touch each.
    expect(touches(one, 0)).toBe(bare + 18);
    expect(touches(holding([lying(1, 40, 70, 0, 0, { jewel: true }), lying(2, 60, 20, 1, 0, { jewel: true })]), 0)).toBe(bare + 36);
    // One still on its way down from the lip has none of them yet.
    expect(touches(holding([lying(1, 12, 45, 0, 0, { jewel: true, sinceDrop: LIP_FALL / 2 })]), 0)).toBe(bare);
    // And one touch for the glow of each lamp that is lit.
    for (let lit = 0; lit < JEWEL_LAMPS.count; lit++) expect(touches(holding([]), lit)).toBe(bare + lit * 6);
    // Without reduced motion the glint comes and goes as the lamps drift: looked at a dozen times over three seconds, it is there at some and not at others.
    const seen = new Set<number>();
    for (let look = 0; look < 12; look++) {
      ageStage(stage, 0.25);
      seen.add(touches(one, 0, false) - touches(holding([]), 0, false));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([12, 18]);
  });

  it('lights a chute for a moment when a medal has gone down it', () => {
    fakeDocument();
    const machine = holding([lying(1, 99, 90, 0)]);
    const stage = createStage(1, false);
    trackMedals(stage, machine, 0);
    const before = new Flat(600);
    buildTouches(before, machine, 40, stage, { showGuide: false });
    // The medal leaves by the right side.
    machine.medals = [];
    trackMedals(stage, machine, 0);
    expect(stage.sideGlow[1]).toBeGreaterThan(0);
    const after = new Flat(600);
    buildTouches(after, machine, 40, stage, { showGuide: false });
    expect(after.count).toBe(before.count + 6);
    ageStage(stage, 1);
    const later = new Flat(600);
    buildTouches(later, machine, 40, stage, { showGuide: false });
    expect(later.count).toBe(before.count);
  });
});

// ── WebGL, stood in for ─────────────────────────────────────────────────────

interface FakeGl {
  gl: WebGL2RenderingContext;
  /** Everything made and not yet deleted, by kind. */
  alive: () => Record<string, number>;
  made: () => number;
  calls: Record<string, number>;
  /** Every colour a clear was set to, as it was asked for. */
  cleared: number[][];
  /** Every sharpness a texture was asked to have when seen at a slant. */
  sharpness: number[];
  state: {
    lost: boolean;
    compiles: boolean;
    /** The most sharpness at a slant the device can give, or null if it has no such extension. */
    anisotropy: number | null;
    /** The errors the context has flagged and not yet been asked about. */
    errors: number[];
    /** A call the device refuses, and the error it flags for it: the call goes through, as in WebGL, and only the flag says so. */
    refuses: string | null;
    refusal: string;
    /** How often the context has been asked for an error. */
    asked: number;
  };
}

/** The numbers the anisotropy extension gives its two names. */
const SHARPNESS = { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff } as const;

/**
 * A WebGL2 context that draws nothing. It hands out a new object for every
 * `create…`, forgets it on `delete…`, counts every call, and gives every
 * constant a number of its own.
 */
function fakeGl(): FakeGl {
  const alive = new Map<object, string>();
  const calls: Record<string, number> = {};
  // No error is 0 in WebGL, and code is free to count on that.
  const constants = new Map<string, number>([['NO_ERROR', 0]]);
  const state: FakeGl['state'] = { lost: false, compiles: true, anisotropy: null, errors: [], refuses: null, refusal: 'OUT_OF_MEMORY', asked: 0 };
  const sharpness: number[] = [];
  const cleared: number[][] = [];
  let made = 0;
  const constant = (name: string) => {
    if (!constants.has(name)) constants.set(name, 1000 + constants.size);
    return constants.get(name) as number;
  };
  const own: Record<string, unknown> = {
    drawingBufferWidth: 640,
    drawingBufferHeight: 540,
    isContextLost: () => state.lost,
    getShaderParameter: () => state.compiles,
    getProgramParameter: (_program: object, name: number) => (name === constant('LINK_STATUS') ? true : 0),
    getShaderInfoLog: () => 'it will not compile',
    getProgramInfoLog: () => '',
    getExtension: (name: string) => (name === 'EXT_texture_filter_anisotropic' && state.anisotropy !== null ? SHARPNESS : null),
    getParameter: (name: number) => (name === SHARPNESS.MAX_TEXTURE_MAX_ANISOTROPY_EXT ? state.anisotropy : 0),
    // As in WebGL: asking for more sharpness than the device has is refused, with a flag and nothing else.
    texParameterf: (_target: number, name: number, value: number) => {
      if (name !== SHARPNESS.TEXTURE_MAX_ANISOTROPY_EXT) return;
      sharpness.push(value);
      if (state.anisotropy === null || value > state.anisotropy || value < 1) state.errors.push(constant('INVALID_VALUE'));
    },
    getError: () => {
      state.asked++;
      return state.errors.shift() ?? 0;
    },
    checkFramebufferStatus: () => constant('FRAMEBUFFER_COMPLETE'),
    clearColor: (...colour: number[]) => {
      cleared.push(colour);
    },
  };
  const gl = new Proxy(own, {
    get: (target, name: string) => {
      if (name in target) return target[name];
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) return constant(name);
      return (...args: unknown[]) => {
        calls[name] = (calls[name] ?? 0) + 1;
        if (name === state.refuses) state.errors.push(constant(state.refusal));
        if (name.startsWith('create')) {
          const thing = {};
          alive.set(thing, name.slice(6));
          made++;
          return thing;
        }
        if (name.startsWith('delete')) alive.delete(args[0] as object);
        return undefined;
      };
    },
  }) as unknown as WebGL2RenderingContext;
  return {
    gl,
    alive: () => {
      const kinds: Record<string, number> = {};
      for (const kind of alive.values()) kinds[kind] = (kinds[kind] ?? 0) + 1;
      return kinds;
    },
    made: () => made,
    calls,
    cleared,
    sharpness,
    state,
  };
}

/** A canvas that gives out the contexts it is told to, and remembers what was asked of it. */
function fakeCanvas(contexts: { '2d'?: unknown; webgl2?: unknown }) {
  const asked: { kind: string; options?: WebGLContextAttributes }[] = [];
  const listeners = new Map<string, (event: Event) => void>();
  const canvas = {
    width: 686,
    height: 579,
    dataset: {} as Record<string, string>,
    getContext: (kind: '2d' | 'webgl2', options?: WebGLContextAttributes) => {
      asked.push({ kind, options });
      return contexts[kind] ?? null;
    },
    addEventListener: (name: string, listener: (event: Event) => void) => void listeners.set(name, listener),
    removeEventListener: (name: string) => void listeners.delete(name),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, asked, listeners };
}

/** A 2D context that counts what is done to it, and keeps every colour it is told to fill with. */
function fake2d() {
  const calls: Record<string, number> = {};
  const fills: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    {},
    {
      get: (_target, name: string) => () => {
        calls[name] = (calls[name] ?? 0) + 1;
        return gradient;
      },
      set: (_target, name: string, value: unknown) => {
        if (name === 'fillStyle' && typeof value === 'string') fills.push(value);
        return true;
      },
    },
  );
  return { context, calls, fills };
}

describe('the 3D scene on a graphics card', () => {
  it('draws every medal in one call and a frame in a handful, and gives everything back', () => {
    fakeDocument();
    const fake = fakeGl();
    const scene = createScene3d(fake.gl);
    const held = fake.alive();
    // Nine programs of two shaders each, the pictures and the relief and the shadow map, and one framebuffer for it.
    expect(held.Program).toBe(9);
    expect(held.Shader).toBe(18);
    expect(held.Texture).toBe(9);
    expect(held.Framebuffer).toBe(1);
    expect(held.Buffer).toBeGreaterThan(10);
    expect(held.VertexArray).toBeGreaterThan(5);

    const machine = createMachine(7, 2);
    const stage = createStage(1, false);
    trackMedals(stage, machine, 0);
    const before = { ...fake.calls };
    scene.draw(stage, machine, { showGuide: true });
    const during = (name: string) => (fake.calls[name] ?? 0) - (before[name] ?? 0);
    expect(scene.last.medals).toBe(machine.medals.length - 2);
    expect(scene.last.balls).toBe(2);
    // No jewel lies on this machine, and nothing is sent or drawn for none.
    expect(scene.last.jewels).toBe(0);
    // The medals: once into the shadow map, once into the picture. The balls the same, and the pins and bulbs once.
    expect(during('drawElementsInstanced')).toBe(5);
    // The contact shadows are one more call for all the medals together.
    expect(during('drawArraysInstanced')).toBe(1);
    // Twenty in all, the payout works' one run of surfaces included: the hopper's doors are always there to draw.
    expect(scene.last.calls).toBeLessThan(21);
    expect(during('drawElementsInstanced') + during('drawArraysInstanced') + during('drawArrays')).toBe(scene.last.calls);
    // One upload for the medals, and one for each of the four other lists that change.
    expect(during('bufferData')).toBe(5);
    // Nothing is made while drawing.
    expect(fake.alive()).toEqual(held);
    // The picture is cleared to nothing at all, so the page's screen, behind the canvas, shows wherever nothing is drawn over it.
    expect(fake.cleared).toEqual([[0, 0, 0, 0]]);

    // A second frame with a medal on an arm and a gate lit makes nothing either, and a third with the medal in the air.
    dropAt(machine, 30);
    step(machine, 0.1);
    lightGate(stage, 1);
    scene.draw(stage, machine, { showGuide: false, calm: true });
    expect(fake.alive()).toEqual(held);
    expect(machine.rolling).toHaveLength(1);
    expect(scene.last.medals).toBe(machine.medals.length - 2 + 1);
    step(machine, ROLL_TIME);
    scene.draw(stage, machine, { showGuide: false, calm: true });
    expect(machine.falling).toHaveLength(1);
    expect(scene.last.medals).toBe(machine.medals.length - 2 + 1);
    expect(fake.alive()).toEqual(held);

    // A ball that lies under the catcher is drawn after everything else: the catcher's hood is laid on the
    // finished picture with nothing of it shown, and then the ball, which is one more upload and three more calls.
    expect(fake.calls.colorMask ?? 0).toBe(0);
    machine.medals.push(lying(999, 50, pusherFront(machine.time) + R, 0, 0, { ball: true }));
    const mark = { ...fake.calls };
    scene.draw(stage, machine, { showGuide: false, calm: true });
    const since = (name: string) => (fake.calls[name] ?? 0) - (mark[name] ?? 0);
    expect(scene.last.balls).toBe(3);
    expect(since('colorMask')).toBe(2);
    expect(since('drawElementsInstanced')).toBe(7);
    expect(since('bufferData')).toBe(6);
    expect(since('drawElementsInstanced') + since('drawArraysInstanced') + since('drawArrays')).toBe(scene.last.calls);
    expect(fake.alive()).toEqual(held);

    // Two jewels, one on a table and one in the air, are one more upload and two more calls: into the shadow map and into the picture.
    machine.medals.push(lying(998, 30, 70, 0, 0, { jewel: true }));
    dropJewel(machine);
    const marked = { ...fake.calls };
    scene.draw(stage, machine, { showGuide: false, calm: true, jewels: 2 });
    const after = (name: string) => (fake.calls[name] ?? 0) - (marked[name] ?? 0);
    expect(scene.last.jewels).toBe(2);
    expect(scene.last.balls).toBe(3);
    expect(scene.last.medals).toBe(machine.medals.length - 4 + 1);
    expect(after('drawElementsInstanced')).toBe(9);
    expect(after('bufferData')).toBe(7);
    expect(after('drawElementsInstanced') + after('drawArraysInstanced') + after('drawArrays')).toBe(scene.last.calls);
    expect(fake.alive()).toEqual(held);

    scene.dispose();
    expect(fake.alive()).toEqual({});
    expect(fake.made()).toBeGreaterThan(40);
  });

  it('gives back what it had made when the graphics card refuses a shader', () => {
    fakeDocument();
    const fake = fakeGl();
    fake.state.compiles = false;
    expect(() => createScene3d(fake.gl)).toThrow(/did not compile: it will not compile/);
    expect(fake.alive()).toEqual({});
    expect(fake.made()).toBeGreaterThan(0);
  });

  it('asks a texture to be only as sharp at a slant as the device can make it', () => {
    fakeDocument();
    /** What the scene's textures were asked for on a device that can do this much, and whether the device took it. */
    const asked = (anisotropy: number | null) => {
      const fake = fakeGl();
      fake.state.anisotropy = anisotropy;
      const scene = createScene3d(fake.gl);
      scene.dispose();
      return fake.sharpness;
    };
    // Seven pictures and the relief: eight textures that are seen at a slant. The shadow map is not one of them.
    expect(asked(16)).toEqual(Array(8).fill(4));
    expect(asked(4)).toEqual(Array(8).fill(4));
    // A device that can only do 2 is asked for 2: asking it for 4 is an error, and the scene would not start.
    expect(asked(2)).toEqual(Array(8).fill(2));
    // One that says it can do no better than plain, and one without the extension, are asked for nothing.
    expect(asked(1)).toEqual([]);
    expect(asked(null)).toEqual([]);
  });

  it('finds out, once, when the graphics card has no memory for part of the scene, and gives everything back', () => {
    fakeDocument();
    // WebGL does not throw when a texture, a buffer or the shadow map cannot be had: it flags an error and carries on.
    for (const call of ['texImage2D', 'bufferData', 'generateMipmap', 'framebufferTexture2D']) {
      const fake = fakeGl();
      fake.state.refuses = call;
      expect(() => createScene3d(fake.gl)).toThrow(/refused part of the scene: OUT_OF_MEMORY/);
      expect(fake.calls[call]).toBeGreaterThan(0);
      expect(fake.alive()).toEqual({});
      expect(fake.made()).toBeGreaterThan(40);
    }
    // Any other refusal counts too, and is named.
    const refused = fakeGl();
    refused.state.refuses = 'texParameteri';
    refused.state.refusal = 'INVALID_ENUM';
    expect(() => createScene3d(refused.gl)).toThrow(/refused part of the scene: INVALID_ENUM/);
    expect(refused.alive()).toEqual({});

    // What the context had refused before the scene was set up is not held against the scene.
    const fake = fakeGl();
    fake.state.errors.push(fake.gl.INVALID_ENUM, fake.gl.INVALID_OPERATION);
    const scene = createScene3d(fake.gl);
    expect(fake.state.errors).toEqual([]);
    // Asking is slow on some drivers: it is done at set-up and never while drawing.
    const asked = fake.state.asked;
    expect(asked).toBeLessThan(6);
    const machine = createMachine(7, 2);
    const stage = createStage(1, false);
    for (let frame = 0; frame < 3; frame++) scene.draw(stage, machine, { showGuide: true });
    expect(fake.state.asked).toBe(asked);
    scene.dispose();
    expect(fake.alive()).toEqual({});
  });
});

describe('the shaders', () => {
  const sources = Object.entries(shaders).filter((entry): entry is [string, string] => typeof entry[1] === 'string');

  it('are all there, each a whole program for the version of the language WebGL2 speaks', () => {
    expect(sources.length).toBeGreaterThanOrEqual(13);
    for (const [, source] of sources) {
      expect(source.startsWith('#version 300 es\n')).toBe(true);
      expect(source).toContain('void main()');
    }
  });

  it('never ask for a smoothstep with its upper edge first, which the language leaves to the driver', () => {
    const number = String.raw`\s*(-?\d+(?:\.\d+)?)\s*`;
    const literal = new RegExp(String.raw`smoothstep\(${number},${number},`, 'g');
    let found = 0;
    for (const [name, source] of sources) {
      for (const [call, low, high] of source.matchAll(literal)) {
        found++;
        // Equal edges are no better: that divides nothing by nothing.
        expect(Number(low), `${call} in ${name}`).toBeLessThan(Number(high));
      }
      // Every smoothstep in a shader has edges that can be read off here, so none slips past the check.
      expect(source.match(/smoothstep\(/g)?.length ?? 0).toBe([...source.matchAll(literal)].length);
    }
    expect(found).toBeGreaterThan(30);
    // The check does catch one written the wrong way round.
    expect([...'smoothstep(0.5, -0.7, x)'.matchAll(literal)].map((match) => Number(match[1]) < Number(match[2]))).toEqual([false]);
  });

  it('never ask for the other things a driver may work out its own way', () => {
    for (const [name, source] of sources) {
      // Nothing is raised to a power that could be below zero: every base is a `max` or a `clamp`, a
      // direction's own measure, or a value already kept in range a line or two before.
      for (const [call, base] of source.matchAll(/pow\(([^,]+),/g)) {
        expect(base.trim(), `${call} in ${name}`).toMatch(/^(max\(|clamp\(|toward$|facing$|1\.0 - facing$|c$)/);
      }
      // An angle is never worked out from two numbers that can both be zero without a look first.
      for (const match of source.matchAll(/atan\(([^,()]+),([^()]+)\)/g)) {
        const before = source.slice(0, match.index);
        const guarded = /if \(abs\(r\.y\) \+ abs\(r\.z\) < 1e-4\) return 0\.0;\s*$/.test(before.slice(0, before.lastIndexOf('float row'))) || match[1].includes('vLocal');
        expect(guarded, `${match[0]} in ${name}`).toBe(true);
      }
      // `clamp` always has its lower bound first.
      for (const [call, low, high] of source.matchAll(/clamp\([^;]*?,\s*(-?\d+\.\d+),\s*(-?\d+\.\d+|r)\)/g)) {
        if (high !== 'r') expect(Number(low), `${call} in ${name}`).toBeLessThan(Number(high));
      }
    }
    // `facing`, which 1 is taken from before raising to a power, is kept to 1 at most wherever it is worked out.
    const facing = sources.flatMap(([, source]) => [...source.matchAll(/float facing = ([^;]+);/g)].map((match) => match[1]));
    expect(facing).toHaveLength(4);
    for (const worked of facing) expect(worked).toMatch(/^clamp\(dot\(normal, toEye\), 0\.0?3?, 1\.0\)$/);
  });
});

describe('the choice of renderer', () => {
  it('reads what the address asks for', () => {
    expect(askedFor('')).toBeNull();
    expect(askedFor('?renderer=2d')).toBe('2d');
    expect(askedFor('?lang=ja&renderer=2d')).toBe('2d');
    expect(askedFor('?renderer=webgl')).toBe('webgl');
    expect(askedFor('?renderer=3d')).toBeNull();
    expect(askedFor('?renderer=')).toBeNull();
    // Unless the address insists, a browser that would draw the scene in software is told not to.
    expect(sceneContext(false).failIfMajorPerformanceCaveat).toBe(true);
    expect(sceneContext(true).failIfMajorPerformanceCaveat).toBe(false);
    // The canvas is see-through, for the page's screen behind it, and what is drawn on it is already multiplied by how much it hides.
    expect(sceneContext(false).alpha).toBe(true);
    expect(sceneContext(true).alpha).toBe(true);
    expect(sceneContext(false).premultipliedAlpha).toBe(true);
  });

  /** A cabinet's two canvases and a renderer for them. */
  const setUp = (search: string, webgl: boolean) => {
    fakeDocument();
    const flat = fake2d();
    const fake = fakeGl();
    const field = fakeCanvas({ '2d': flat.context });
    const under = fakeCanvas({ webgl2: webgl ? fake.gl : null });
    const renderer = createRenderer(field.canvas, under.canvas, search);
    if (!renderer) throw new Error('no renderer');
    const machine = createMachine(7, 2);
    const stage = (painted: boolean) => {
      const made = createStage(686 / 640, painted);
      trackMedals(made, machine, 0);
      return made;
    };
    return { renderer, field, under, fake, flat, machine, stage };
  };
  const options = { showGuide: true };

  it('draws in 3D where the browser gives a WebGL2 context', () => {
    const { renderer, field, under, fake, flat, machine, stage } = setUp('', true);
    expect(renderer.kind).toBe('webgl');
    expect(field.canvas.dataset.renderer).toBe('webgl');
    // The field's own canvas is asked for a 2D context and the one under it for WebGL2, never the other way round.
    expect(field.asked.map((entry) => entry.kind)).toEqual(['2d']);
    expect(under.asked.map((entry) => entry.kind)).toEqual(['webgl2']);
    expect(under.asked[0].options?.failIfMajorPerformanceCaveat).toBe(true);

    const first = stage(false);
    renderer.draw(first, machine, options);
    expect(fake.calls.drawElementsInstanced).toBeGreaterThan(0);
    // The scene's canvas is kept the size of the field's.
    expect([under.canvas.width, under.canvas.height]).toEqual([686, 579]);
    // On the field's canvas only the glass is drawn, over a clear sheet: its bands, its dust and the line of light
    // along its top, and no background and no medal stamped.
    expect(flat.calls.clearRect).toBe(1);
    expect(flat.calls.fillRect).toBe(3);
    expect(flat.calls.drawImage).toBeUndefined();
    expect(first.painted).toBe(false);

    // While nothing is on the glass it is left alone.
    renderer.draw(first, machine, options);
    renderer.draw(first, machine, options);
    expect(flat.calls.clearRect).toBe(1);
    // A count floating up is drawn every frame, and cleared once when it has gone.
    first.popups.push({ x: 300, y: 400, text: '+3', age: 0 });
    renderer.draw(first, machine, options);
    renderer.draw(first, machine, options);
    expect(flat.calls.clearRect).toBe(3);
    expect(flat.calls.fillText).toBe(2);
    first.popups.length = 0;
    renderer.draw(first, machine, options);
    renderer.draw(first, machine, options);
    expect(flat.calls.clearRect).toBe(4);
    // A new stage means the canvas was resized, which empties it: the glass goes on again.
    renderer.draw(stage(false), machine, options);
    expect(flat.calls.clearRect).toBe(5);

    renderer.dispose();
    expect(fake.alive()).toEqual({});
    expect(under.listeners.size).toBe(0);
  });

  it('lets the bands on the glass drift over the 3D scene, drawn again a few times a second at most and never in a calm cabinet', () => {
    const { renderer, flat, machine, stage } = setUp('', true);
    const first = stage(false);
    renderer.draw(first, machine, options);
    expect(flat.calls.clearRect).toBe(1);
    // A frame later the bands have not moved half a pixel, and the glass is left alone.
    first.clock = 1 / 60;
    renderer.draw(first, machine, options);
    expect(flat.calls.clearRect).toBe(1);
    // A second later they have moved some three pixels: it is drawn again, once.
    first.clock = 1;
    expect(glassShift(1)).toBeGreaterThan(2);
    renderer.draw(first, machine, options);
    renderer.draw(first, machine, options);
    expect(flat.calls.clearRect).toBe(2);
    // At their fastest, as they pass the middle of their drift, that is seven times in a second and no more.
    first.clock = GLASS.period;
    renderer.draw(first, machine, options);
    const before = flat.calls.clearRect;
    for (let frame = 0; frame < 60; frame++) {
      first.clock += 1 / 60;
      renderer.draw(first, machine, options);
    }
    expect(flat.calls.clearRect - before).toBeGreaterThan(3);
    expect(flat.calls.clearRect - before).toBeLessThanOrEqual(7);
    // In a calm cabinet they stand still, and so does the canvas.
    const calm = setUp('', true);
    const still = calm.stage(false);
    for (let frame = 0; frame < 30; frame++) {
      still.clock += 0.5;
      calm.renderer.draw(still, calm.machine, { ...options, calm: true });
    }
    expect(calm.flat.calls.clearRect).toBe(1);
  });

  it('puts a lighter wash of colour over the 3D scene than the canvas renderer puts over its own', () => {
    /** How strong the wash of a fever is, a moment into it, with the renderer this address gives. */
    const wash = (search: string, calm = false) => {
      const { renderer, flat, machine, stage } = setUp(search, true);
      const feverish = stage(search !== '');
      feverish.party = { kind: 'fever', left: 3 };
      feverish.clock = 1.23;
      renderer.draw(feverish, machine, { ...options, calm });
      const colour = flat.fills.find((fill) => fill.startsWith('hsla('));
      return colour ? Number(colour.slice(colour.lastIndexOf(',') + 1, -1)) : 0;
    };
    // The 3D medals are a brighter gold than the drawn ones, and a full wash turns them pale.
    expect(WASH_OVER_3D).toBeGreaterThan(0.2);
    expect(WASH_OVER_3D).toBeLessThan(0.8);
    expect(wash('?renderer=2d')).toBeGreaterThan(0.02);
    expect(wash('')).toBeCloseTo(wash('?renderer=2d') * WASH_OVER_3D, 9);
    // With motion reduced there is none over either.
    expect(wash('', true)).toBe(0);
    expect(wash('?renderer=2d', true)).toBe(0);
  });

  it('draws on the canvas where there is no WebGL2', () => {
    const { renderer, field, under, fake, flat, machine, stage } = setUp('', false);
    expect(renderer.kind).toBe('2d');
    expect(field.canvas.dataset.renderer).toBe('2d');
    expect(under.asked.map((entry) => entry.kind)).toEqual(['webgl2']);
    expect(under.listeners.size).toBe(0);
    // A stage made for the 3D renderer is painted the first time the canvas renderer needs it.
    const blank = stage(false);
    renderer.draw(blank, machine, options);
    expect(blank.painted).toBe(true);
    expect(flat.calls.drawImage).toBeGreaterThan(machine.medals.length);
    expect(fake.made()).toBe(0);
    renderer.dispose();
  });

  it('draws on the canvas when the address asks for it, without touching WebGL', () => {
    const { renderer, field, under, fake, flat, machine, stage } = setUp('?renderer=2d', true);
    expect(renderer.kind).toBe('2d');
    expect(field.canvas.dataset.renderer).toBe('2d');
    expect(under.asked).toEqual([]);
    renderer.draw(stage(true), machine, options);
    expect(flat.calls.drawImage).toBeGreaterThan(machine.medals.length);
    expect(fake.made()).toBe(0);
  });

  it('insists on 3D when the address asks for that', () => {
    const { renderer, under } = setUp('?renderer=webgl', true);
    expect(renderer.kind).toBe('webgl');
    expect(under.asked[0].options?.failIfMajorPerformanceCaveat).toBe(false);
  });

  it('hands over to the canvas when the context is lost, and back when it is restored', () => {
    const { renderer, field, under, fake, flat, machine, stage } = setUp('', true);
    const current = stage(false);
    renderer.draw(current, machine, options);
    expect(renderer.kind).toBe('webgl');
    const drawn = fake.calls.drawElementsInstanced;

    // The graphics card drops the context. The loss is taken (so it can come back), and the very next frame is drawn in 2D.
    let prevented = false;
    fake.state.lost = true;
    under.listeners.get('webglcontextlost')?.({ preventDefault: () => (prevented = true) } as unknown as Event);
    expect(prevented).toBe(true);
    expect(renderer.kind).toBe('2d');
    expect(field.canvas.dataset.renderer).toBe('2d');
    renderer.draw(current, machine, options);
    expect(current.painted).toBe(true);
    expect(flat.calls.drawImage).toBeGreaterThan(machine.medals.length);
    expect(fake.calls.drawElementsInstanced).toBe(drawn);

    // It comes back empty: the scene is set up again from nothing, and the field's canvas is cleared of the 2D picture.
    const before = fake.made();
    const cleared = flat.calls.clearRect;
    fake.state.lost = false;
    under.listeners.get('webglcontextrestored')?.({} as Event);
    expect(renderer.kind).toBe('webgl');
    expect(field.canvas.dataset.renderer).toBe('webgl');
    expect(fake.made()).toBeGreaterThan(before);
    renderer.draw(current, machine, options);
    expect(fake.calls.drawElementsInstanced).toBeGreaterThan(drawn);
    expect(flat.calls.clearRect).toBe(cleared + 1);
    renderer.dispose();
    expect(under.listeners.size).toBe(0);
  });

  it('stays with the canvas when a lost context does not come back, or comes back unusable', () => {
    const { renderer, under, fake, machine, stage } = setUp('', true);
    fake.state.lost = true;
    under.listeners.get('webglcontextlost')?.({ preventDefault: () => undefined } as unknown as Event);
    for (let frame = 0; frame < 3; frame++) renderer.draw(stage(true), machine, options);
    expect(renderer.kind).toBe('2d');
    // Restored, but its shaders no longer compile.
    fake.state.lost = false;
    fake.state.compiles = false;
    under.listeners.get('webglcontextrestored')?.({} as Event);
    expect(renderer.kind).toBe('2d');
    expect(() => renderer.draw(stage(true), machine, options)).not.toThrow();
    renderer.dispose();
  });

  it('falls back to the canvas when the graphics card will not take the scene', () => {
    fakeDocument();
    const fake = fakeGl();
    fake.state.compiles = false;
    const field = fakeCanvas({ '2d': fake2d().context });
    const under = fakeCanvas({ webgl2: fake.gl });
    const renderer = createRenderer(field.canvas, under.canvas, '');
    expect(renderer?.kind).toBe('2d');
    expect(field.canvas.dataset.renderer).toBe('2d');
    expect(fake.alive()).toEqual({});
  });

  it('falls back to the canvas when the graphics card runs out of memory for the scene, with nothing left behind', () => {
    fakeDocument();
    const fake = fakeGl();
    // A texture's upload goes through without a word, as it does in WebGL, and only the error flag says it failed.
    fake.state.refuses = 'texImage2D';
    const flat = fake2d();
    const field = fakeCanvas({ '2d': flat.context });
    const under = fakeCanvas({ webgl2: fake.gl });
    const renderer = createRenderer(field.canvas, under.canvas, '');
    if (!renderer) throw new Error('no renderer');
    expect(renderer.kind).toBe('2d');
    expect(field.canvas.dataset.renderer).toBe('2d');
    expect(fake.made()).toBeGreaterThan(40);
    expect(fake.alive()).toEqual({});
    // And the field is drawn all the same, by the canvas renderer.
    const machine = createMachine(7, 2);
    const stage = createStage(1, false);
    trackMedals(stage, machine, 0);
    renderer.draw(stage, machine, { showGuide: true });
    expect(flat.calls.drawImage).toBeGreaterThan(machine.medals.length);
    expect(fake.calls.drawElementsInstanced).toBeUndefined();
    renderer.dispose();
  });

  it('draws nothing at all only if the field has no 2D context, and does without a second canvas', () => {
    fakeDocument();
    expect(createRenderer(fakeCanvas({}).canvas, fakeCanvas({ webgl2: fakeGl().gl }).canvas, '')).toBeNull();
    const alone = createRenderer(fakeCanvas({ '2d': fake2d().context }).canvas, null, '');
    expect(alone?.kind).toBe('2d');
  });
});

describe('the gold spins’ lamps in the 3D scene', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const bulbs = LAMP_ROWS.hood + LAMP_ROWS.strip * 2 + LAMP_ROWS.rail * 2 + LAMP_ROWS.tray + LAMP_ROWS.face;
  /**
   * How bright one lamp of the hold is built, as the kind of its bead, when the stage's clock says `clock`. The wave
   * is what the renderer hands on with it: the same clock, hurried more than four times over while a fever or a jackpot is on.
   */
  const kindOf = (machine: Machine, lamp: number, clock: number, partying: boolean, calm = false): number => {
    const beads = createRows(BEAD_STRIDE, 16);
    const flat = new Flat(16);
    const wave = calm ? 0 : clock * (partying ? 7 : 1.6);
    buildLamps(beads, flat, machine, 40, wave, partying, { showGuide: false, calm, stock: 8, gold: 3 }, clock);
    return beads.data[(bulbs + lamp) * BEAD_STRIDE + 7];
  };
  const risings = (seen: number[]) => seen.filter((bright, frame) => frame > 0 && seen[frame - 1] < 0.5 && bright >= 0.5).length;

  it('flash at the cabinet’s one rate by the stage’s own clock, however a celebration hurries the wave', () => {
    const machine = createMachine(3);
    expect(GOLD_FLASH.perSecond).toBeLessThanOrEqual(3);
    for (const partying of [false, true]) {
      for (const lamp of [0, 2]) {
        const seen: number[] = [];
        for (let frame = 0; frame <= 120; frame++) {
          const clock = 3 + frame / 120;
          // A gold lamp's bead runs from 0.4 of a bulb's light to all of it.
          const flash = (kindOf(machine, lamp, clock, partying) - BEAD.bulb(0.4)) / 0.6;
          expect(flash).toBeCloseTo(goldFlash(clock, lamp, false), 5);
          seen.push(flash);
        }
        // Twice in the second, in a jackpot too: by the wave it would have been more than a dozen times.
        expect(risings(seen)).toBe(GOLD_FLASH.perSecond);
      }
      // The same clock gives the same lamp whatever the wave is doing.
      expect(kindOf(machine, 1, 4.2, partying)).toBe(kindOf(machine, 1, 4.2, !partying));
    }
  });

  it('do not flash at all with motion reduced, and a held spin that is not gold never does', () => {
    const machine = createMachine(3);
    for (const partying of [false, true]) {
      for (const clock of [3, 3.1, 3.25, 3.4, 9.99]) {
        for (const lamp of [0, 1, 2]) expect(kindOf(machine, lamp, clock, partying, true)).toBeCloseTo(BEAD.bulb(1), 5);
        for (const lamp of [3, 7]) {
          expect(kindOf(machine, lamp, clock, partying)).toBeCloseTo(BEAD.bulb(1), 5);
          expect(kindOf(machine, lamp, clock, partying, true)).toBeCloseTo(BEAD.bulb(1), 5);
        }
      }
    }
  });
});
