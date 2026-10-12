import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, armCollar, armGoal, armTip, rollingSpot } from '@/components/game/MedalPusher/arms';
import { PANEL_TOP, pinSpots, reliefHeight, reliefMap } from '@/components/game/MedalPusher/art3d';
import {
  FLAT_STRIDE,
  Flat,
  LAMP_ROWS,
  MOVING_CAST,
  MOVING_PARTS,
  SHAPE,
  SOLID_STRIDE,
  Solid,
  buildCabinet,
  buildLamps,
  buildMoving,
  buildTouches,
  light,
} from '@/components/game/MedalPusher/cabinet3d';
import {
  CHECKERS,
  FIELD,
  MEDAL_RADIUS,
  MEDAL_THICKNESS,
  PUSHER,
  RELEASE,
  ROLL_TIME,
  SETTLE,
  SWEEP,
  TOWER,
  aimArms,
  buildTowers,
  checkerCentres,
  createMachine,
  dropBall,
  dropMedal,
  pusherFront,
  step,
  type Machine,
  type Medal,
} from '@/components/game/MedalPusher/engine';
import { attitude, rotate, transform } from '@/components/game/MedalPusher/mat4';
import { BALL_RADIUS, EXIT_TIME, GATE, LIP_FALL, ageStage, createStage, lightGate, trackMedals, type ExitingMedal, type Stage } from '@/components/game/MedalPusher/render';
import { createScene3d } from '@/components/game/MedalPusher/render3d';
import * as shaders from '@/components/game/MedalPusher/shaders3d';
import { WASH_OVER_3D, askedFor, createRenderer, sceneContext } from '@/components/game/MedalPusher/renderer';
import {
  BEAD,
  BEAD_STRIDE,
  EYE,
  KEY_LIGHT,
  LEAN,
  MEDAL_STRIDE,
  armTipAt,
  ballShape,
  cameraMatrix,
  chance,
  createRows,
  lightMatrix,
  medalShape,
  writeBalls,
  writeMedals,
  type Rows,
  type Shape,
} from '@/components/game/MedalPusher/scene3d';
import { HEIGHT, VIEW, project, unproject } from '@/components/game/MedalPusher/view';

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

  it('keeps the whole cabinet between its near and far planes, the nearer the smaller', () => {
    for (const [x, height, depth] of [
      [50, 0, 0],
      [0, HEIGHT.wall, 0],
      [-34, -12, 0],
      [50, 0, FIELD.depth],
      [50, -40, FIELD.depth + 12],
      [50, HEIGHT.wall + 6, 2],
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
      [100, 120],
      [320, 300],
      [600, 500],
    ]) {
      const a = unproject(px, py, 0);
      const b = unproject(px, py, 30);
      if (!a || !b) throw new Error('the pixel shows no table');
      const t = (EYE[1] - 0) / 30;
      expect(a.x + (b.x - a.x) * t).toBeCloseTo(EYE[0], 6);
      expect(a.depth + (b.depth - a.depth) * t).toBeCloseTo(EYE[2], 6);
    }
    expect(EYE[0]).toBeCloseTo(FIELD.width / 2, 9);
    expect(EYE[1]).toBeGreaterThan(HEIGHT.wall);
    expect(EYE[2]).toBeGreaterThan(FIELD.depth);
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

  it('sees both tables and everything that can stand on them', () => {
    for (const x of [0, 50, FIELD.width]) {
      for (const y of [0, P, P + TOWER.max * T, RELEASE.height + P]) {
        for (const z of [0, 40, FIELD.depth]) {
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

  it('rolls a fed medal down its arm on its edge, its face to the player, turning as it goes', () => {
    for (const aim of [30, 70]) {
      const machine = holding([]);
      aimArms(machine, aim);
      dropMedal(machine, aim);
      const [rolling] = machine.rolling;
      expect(machine.falling).toHaveLength(0);
      // The tip is wherever the machine has swung it to: here it has not moved yet, and the rail is drawn to it all the same.
      const tip = armTipAt(machine, rolling.arm);
      expect(tip).toBe(machine.tips[rolling.arm]);
      expect(tip).not.toBe(armGoal(machine, rolling.arm));
      const at = (remaining: number) => medalRows({ ...machine, rolling: [{ ...rolling, remaining }] })[0];
      // It goes in at the collar and comes off at the tip, in the plane the arm hangs in.
      const collar = armCollar(rolling.arm);
      const end = armTip(rolling.arm, tip);
      expect([at(ROLL_TIME).x, at(ROLL_TIME).y, at(ROLL_TIME).z]).toEqual([collar.x, collar.height, collar.depth].map(Math.fround));
      expect([at(0).x, at(0).y, at(0).z]).toEqual([end.x, end.height, end.depth].map(Math.fround));
      expect(at(0).y).toBeCloseTo(ARMS.tip, 5);
      let last = at(ROLL_TIME);
      for (let step = 1; step <= 20; step++) {
        const row = at(ROLL_TIME * (1 - step / 20));
        // Downhill all the way, toward the middle of the field.
        expect(row.y).toBeLessThan(last.y);
        expect(Math.abs(row.x - 50)).toBeLessThan(Math.abs(last.x - 50));
        // On its edge with a face to the player: neither face looks up or across.
        expect(Math.abs(row.up[1])).toBeLessThan(1e-6);
        expect(row.up[2]).toBeCloseTo(1, 6);
        expect(row.contact).toBe(0);
        last = row;
      }
      // It rolls: a mark on its rim goes round, clockwise for the player on the left arm and the other way on the right.
      const mark = (remaining: number) => {
        const rows = createRows(MEDAL_STRIDE, 4);
        writeMedals(rows, { ...machine, rolling: [{ ...rolling, remaining }] }, []);
        const [x, y] = rotate(rows.data, 4, [1, 0, 0]);
        return Math.atan2(y, x);
      };
      // Seen from the player's side an angle grows anticlockwise, so going clockwise the mark's falls with time.
      const earlier = mark(ROLL_TIME * 0.52);
      const later = mark(ROLL_TIME * 0.5);
      expect(Math.sign(Math.sin(earlier - later))).toBe(rolling.arm === 0 ? 1 : -1);
      // By the tip it is the way round it will fall and lie, so nothing jumps as it leaves the rail. By then
      // the machine has swung the arm over the aim, and the medal drops from where the tip is, which is where it is drawn.
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

  it('lets a medal go on its edge and brings it down flat where it lands', () => {
    const machine = holding([]);
    dropMedal(machine, 40);
    step(machine, ROLL_TIME + 1e-6);
    const [falling] = machine.falling;
    const at = (remaining: number) => medalRows({ ...machine, falling: [{ ...falling, remaining }] })[0];
    const start = at(falling.duration);
    expect(start.x).toBeCloseTo(falling.fromX, 4);
    expect(start.z).toBeCloseTo(RELEASE.depth, 4);
    // One the player fed drops off the tip of its arm; one the machine pays comes from the top of the back panel.
    expect(start.y).toBeCloseTo(ARMS.tip, 4);
    const paid = medalRows({ ...machine, falling: [{ ...falling, source: 'payout', remaining: falling.duration }] })[0];
    expect(paid.y).toBeGreaterThan(RELEASE.height);
    // On its edge: its faces look along the table, not up.
    expect(Math.abs(start.up[1])).toBeLessThan(0.05);
    expect(Math.abs(paid.up[1])).toBeLessThan(0.05);
    const end = at(0);
    expect(end.x).toBeCloseTo(falling.x, 4);
    expect(end.z).toBeCloseTo(falling.y, 4);
    expect(Math.abs(end.up[1])).toBeCloseTo(1, 5);
    // It only ever comes down, faster and faster, and it turns over on the way.
    let last = start.y;
    let flips = 0;
    let side = Math.sign(start.up[1]) || 1;
    for (let step = 1; step <= 60; step++) {
      const row = at(falling.duration * (1 - step / 60));
      expect(row.y).toBeLessThanOrEqual(last + 1e-6);
      last = row.y;
      if (Math.sign(row.up[1]) !== side && Math.abs(row.up[1]) > 0.05) {
        side = Math.sign(row.up[1]);
        flips++;
      }
      expect(row.contact).toBe(0);
    }
    expect(flips).toBeGreaterThanOrEqual(2);
    // Where it ends is where it lies the moment it has landed on other medals: no jump between the two.
    const landed = medalRows(holding([lying(falling.id, falling.x, falling.y, 1, 1, { grown: 0.3 })]))[0];
    expect(end.y).toBeCloseTo(landed.y, 4);
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
    expect(second.up[0]).toBeGreaterThan(0.5);
    expect(second.light).toBeGreaterThan(0);
    expect(second.light).toBeLessThan(1);
    // Once it is in the dark it is not drawn at all; one over the front is drawn until the stage lets it go.
    expect(medalRows(holding([]), [{ ...lost, age: EXIT_TIME * 0.8 }])).toHaveLength(0);
    expect(medalRows(holding([]), [{ ...won, age: EXIT_TIME * 0.9 }])).toHaveLength(1);
  });

  it('tips a medal forward as it comes over the lip of the pusher', () => {
    const over = (sinceDrop: number) => medalRows(holding([lying(3, 50, 48, 0, 0, { sinceDrop, grown: 1 })]))[0];
    expect(over(0).y).toBeCloseTo(P + T / 2, 5);
    expect(over(LIP_FALL / 2).y).toBeLessThan(P);
    expect(over(LIP_FALL / 2).up[2]).toBeGreaterThan(0.4);
    expect(over(LIP_FALL / 2).contact).toBe(0);
    expect(over(LIP_FALL).y).toBeCloseTo(T / 2, 5);
    expect(over(LIP_FALL).up[1]).toBeGreaterThan(0.995);
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

  it('follows a ball down the back panel and over the front', () => {
    const machine = holding([]);
    dropBall(machine);
    const [falling] = machine.falling;
    const start = ballRows(machine)[0];
    expect(start[1]).toBeCloseTo(RELEASE.height + BALL_RADIUS, 4);
    const end = ballRows({ ...machine, falling: [{ ...falling, remaining: 0 }] })[0];
    expect(end[0]).toBeCloseTo(falling.x, 4);
    expect(end[1]).toBeCloseTo(P + BALL_RADIUS, 4);
    const exit: ExitingMedal = { id: 1, x: 30, y: 100.2, kind: 'won', side: -1, ball: true, age: 0.3 };
    const gone = ballRows(holding([]), [exit])[0];
    expect(gone[1]).toBeLessThan(0);
    expect(gone[2]).toBeGreaterThan(100.2);
    expect(medalRows(holding([]), [exit])).toHaveLength(0);
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

  it('builds the table, the back panel, the walls and the gutters, each run with its picture', () => {
    const solid = new Solid(600);
    const parts = buildCabinet(solid);
    expect(parts.map((part) => part.art)).toEqual(['table', 'panel', 'lip', 'wall', 'plain']);
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
    // The back panel stands at depth 0 from the table to its top, facing the player.
    const panel = corners(solid, parts[1].first, parts[1].count);
    expect(Math.max(...panel.map((corner) => corner.y))).toBe(PANEL_TOP);
    for (const corner of panel) {
      expect(corner.z).toBe(0);
      expect(corner.normal).toEqual([0, 0, 1]);
    }
    // The walls stop where the sides open, and the two face each other.
    const walls = corners(solid, parts[3].first, parts[3].count);
    expect(Math.max(...walls.map((corner) => corner.z))).toBe(FIELD.sideOpenFrom);
    expect(new Set(walls.map((corner) => corner.normal[0]))).toEqual(new Set([1, -1]));
    // Nothing of the cabinet reaches into the field above the tables, so no medal is ever drawn inside a wall.
    // What does stand over it hangs on the back panel, higher than the tallest tower: the arms' brackets and collars.
    for (const corner of corners(solid)) {
      const inside = corner.x > 0.5 && corner.x < FIELD.width - 0.5 && corner.z > 0.5 && corner.z < FIELD.depth - 0.5;
      if (inside) expect(corner.y <= 0.05 || (corner.y > P + TOWER.max * T + R && corner.z < 5)).toBe(true);
      expect(Number.isFinite(corner.x + corner.y + corner.z)).toBe(true);
    }
  });

  it('hangs a collar of polished metal in each upper corner, big enough to take the rail and a medal going in', () => {
    const solid = new Solid(600);
    const plain = buildCabinet(solid).find((part) => part.art === 'plain');
    if (!plain) throw new Error('no plain part');
    const all = corners(solid, plain.first, plain.count);
    for (const arm of [0, 1] as const) {
      const collar = armCollar(arm);
      const round = all.filter((corner) => Math.hypot(corner.x - collar.x, corner.y - collar.height) < 3.5 && corner.y < collar.height + 3.5);
      const widest = Math.max(...round.map((corner) => Math.hypot(corner.x - collar.x, corner.y - collar.height)));
      // Wider than a medal, and standing out past the plane the medals roll in by more than a medal is thick.
      expect(widest).toBeGreaterThan(R);
      expect(widest).toBeLessThan(R + 0.5);
      expect(Math.max(...round.map((corner) => corner.z))).toBeGreaterThan(collar.depth + T);
      expect(Math.min(...round.map((corner) => corner.z))).toBe(0);
      // Its side is polished, and there is a ring of light in its face.
      expect(round.some((corner) => corner.gloss === 1 && Math.abs(corner.normal[2]) < 1e-6)).toBe(true);
      expect(round.some((corner) => corner.glow > 0.5 && corner.normal[2] === 1)).toBe(true);
    }
    // The two are the same, one in each corner.
    const near = (arm: 0 | 1) => all.filter((corner) => Math.hypot(corner.x - armCollar(arm).x, corner.y - armCollar(arm).height) < 3.5 && corner.z > 0.5).length;
    expect(near(0)).toBe(near(1));
    expect(near(0)).toBeGreaterThan(100);
  });

  /** The moving parts at a moment of a new machine's life, its arms' tips wherever they are put. */
  const moving = (time: number, aim = 50, stage: Stage = createStage(1, false), tips?: [number, number]) => {
    const machine = createMachine(3);
    machine.time = time;
    if (tips) machine.tips = tips;
    const solid = new Solid(100);
    buildMoving(solid, machine, pusherFront(time), stage, { aim, showGuide: true });
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

  it('hangs each feed arm from its collar to its tip, wherever the tip is', () => {
    fakeDocument();
    for (const tips of [
      [20, 80],
      [36, 64],
      [9, 55],
    ] as [number, number][]) {
      const { solid, machine } = moving(1, 50, undefined, tips);
      // The arms have a run of their own; here one is on each side of the middle.
      const rails = corners(solid, MOVING_PARTS[2].first, MOVING_PARTS[2].count);
      expect(rails.every((corner) => corner.y > P + 1)).toBe(true);
      for (const arm of [0, 1] as const) {
        const own = rails.filter((corner) => (arm === 0 ? corner.x < tips[0] + 5 : corner.x > tips[1] - 5));
        expect(own.length).toBeGreaterThan(50);
        const from = armCollar(arm);
        const to = armTip(arm, armTipAt(machine, arm));
        const length = Math.hypot(to.x - from.x, to.height - from.height);
        const along = [(to.x - from.x) / length, (to.height - from.height) / length];
        const far = own.map((corner) => (corner.x - from.x) * along[0] + (corner.y - from.height) * along[1]);
        const off = own.map((corner) => Math.abs((corner.x - from.x) * along[1] - (corner.y - from.height) * along[0]));
        // The rail runs from behind the collar, where the collar hides its end, to a hood that goes round the tip.
        expect(Math.min(...far)).toBeLessThan(0);
        expect(Math.min(...far)).toBeGreaterThan(-3);
        expect(Math.max(...far)).toBeGreaterThan(length + R);
        expect(Math.max(...far)).toBeLessThan(length + R + 1.2);
        // Its two bars leave room for a medal between them, and it is nowhere wider than that and a little.
        expect(Math.max(...off)).toBeGreaterThan(R);
        expect(Math.max(...off)).toBeLessThan(R + 1.2);
        // The channel has the plane the medals roll in between its back and its front, with room for a medal's thickness.
        expect(Math.min(...own.map((corner) => corner.z))).toBeLessThan(ARMS.depth - T / 2);
        expect(Math.min(...own.map((corner) => corner.z))).toBeGreaterThan(0);
        expect(Math.max(...own.map((corner) => corner.z))).toBeGreaterThan(ARMS.depth + T / 2);
        // A medal anywhere on the rail is inside it.
        for (const remaining of [ROLL_TIME, ROLL_TIME / 2, 0]) {
          const spot = rollingSpot(arm, armTipAt(machine, arm), remaining);
          const offLine = Math.abs((spot.x - from.x) * along[1] - (spot.height - from.height) * along[0]);
          expect(offLine).toBeLessThan(1e-9);
        }
      }
    }
    // Only the pusher throws a shadow. A rail's would be two thin lines on the pusher under it, which look like
    // scratches; the gates and their signs are lights. So the arms come after everything that casts.
    expect(MOVING_CAST).toBe(2);
    expect(MOVING_PARTS.map((part) => part.art)).toEqual(['pusher', 'plain', 'plain', 'plain', 'sign']);
    const { solid } = moving(1);
    const casting = corners(solid, 0, MOVING_PARTS[0].count + MOVING_PARTS[1].count);
    expect(MOVING_PARTS[1].first).toBe(MOVING_PARTS[0].count);
    expect(Math.max(...casting.map((corner) => corner.y))).toBe(P);
  });

  it('lights the arm that takes the next medal, and one with a medal on its rail', () => {
    fakeDocument();
    /** How bright the bars of each arm are: the self-lit corners left and right of the middle, above the pusher. */
    const lit = (machine: Machine, aim: number) => {
      machine.tips = [20, 80];
      const solid = new Solid(100);
      buildMoving(solid, machine, 40, createStage(1, false), { aim, showGuide: true });
      const bars = corners(solid, MOVING_PARTS[2].first, MOVING_PARTS[2].count).filter((corner) => corner.glow > 0);
      const of = (left: boolean) => Math.max(...bars.filter((corner) => corner.x < 50 === left).map((corner) => corner.glow));
      return [of(true), of(false)];
    };
    const machine = createMachine(3);
    const [leftAtLeft, rightAtLeft] = lit(machine, 20);
    expect(leftAtLeft).toBeGreaterThan(rightAtLeft);
    const [leftAtRight, rightAtRight] = lit(machine, 80);
    expect(rightAtRight).toBe(leftAtLeft);
    expect(leftAtRight).toBe(rightAtLeft);
    // A medal still rolling down the left arm keeps it lit after the aim has gone over to the right.
    dropMedal(machine, 20);
    aimArms(machine, 80);
    expect(lit(machine, 80)).toEqual([leftAtLeft, leftAtLeft]);
  });

  it('throws the shadow of an arm, and of each medal on it, on the back panel', () => {
    fakeDocument();
    const machine = createMachine(3);
    const touches = () => {
      const flat = new Flat(600);
      buildTouches(flat, machine, 40, createStage(1, false), { aim: 30, showGuide: false });
      return flat;
    };
    // The arms are swung over the aim first, so the rail is as long with a medal on it as without.
    aimArms(machine, 30);
    step(machine, 1);
    const empty = touches();
    dropMedal(machine, 30);
    step(machine, ROLL_TIME / 2);
    const flat = touches();
    // One more touch than with nothing on the rail: the medal's shadow, a round spot of dark just off the panel.
    expect(flat.count).toBe(empty.count + 6);
    const spot = rollingSpot(0, armTipAt(machine, 0), machine.rolling[0].remaining);
    // The middle of every round spot of dark laid on the panel: each is six corners, the first and the third opposite.
    const spots: { x: number; y: number }[] = [];
    for (let at = 0; at < flat.count * FLAT_STRIDE; at += 6 * FLAT_STRIDE) {
      const opposite = at + 2 * FLAT_STRIDE;
      if (flat.data[at + 10] !== SHAPE.spot || flat.data[at + 6] < 0.3 || flat.data[at + 2] > 0.1) continue;
      spots.push({ x: (flat.data[at] + flat.data[opposite]) / 2, y: (flat.data[at + 1] + flat.data[opposite + 1]) / 2 });
    }
    // Each collar has one, and so has the medal: to its lower right, as the 2D drawing has it, and close by.
    expect(spots).toHaveLength(3);
    const own = spots.filter((shadow) => Math.hypot(shadow.x - spot.x, shadow.y - spot.height) < R);
    expect(own).toHaveLength(1);
    expect(own[0].x).toBeGreaterThan(spot.x);
    expect(own[0].y).toBeLessThan(spot.height);
  });

  it('draws every gate and its sign where the sweep has taken it, and lights one a medal came through', () => {
    fakeDocument();
    for (const time of [0, SWEEP.period / 4, 2.2, (SWEEP.period * 3) / 4]) {
      const { solid } = moving(time);
      const centres = checkerCentres(time);
      const gates = corners(solid, MOVING_PARTS[3].first, MOVING_PARTS[3].count);
      const signs = corners(solid, MOVING_PARTS[4].first, MOVING_PARTS[4].count);
      expect(signs).toHaveLength(6 * CHECKERS.positions.length);
      centres.forEach((centre, gate) => {
        const sign = signs.slice(gate * 6, gate * 6 + 6);
        const xs = sign.map((corner) => corner.x);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(centre, 4);
        // The sign rides above the gate's opening, on the back panel.
        expect(Math.min(...sign.map((corner) => corner.y))).toBeGreaterThan(P + GATE.height);
        expect(Math.max(...sign.map((corner) => corner.y))).toBeLessThan(HEIGHT.wall);
        // Each gate is three tubes round an opening as wide as a medal that just goes through on either side.
        const tubes = gates.slice(gate * 72, gate * 72 + 72).map((corner) => corner.x);
        expect((Math.min(...tubes) + Math.max(...tubes)) / 2).toBeCloseTo(centre, 4);
        expect(Math.max(...tubes) - Math.min(...tubes)).toBeGreaterThan(2 * (R + CHECKERS.halfWidth));
        expect(Math.max(...tubes) - Math.min(...tubes)).toBeLessThan(2 * (R + CHECKERS.halfWidth) + 1);
      });
      expect(gates).toHaveLength(72 * CHECKERS.positions.length);
    }
    const dark = moving(1);
    const stage = createStage(1, false);
    lightGate(stage, 2);
    const lit = moving(1, 50, stage);
    const tube = (solid: Solid, gate: number) => corners(solid, MOVING_PARTS[3].first + gate * 72, 1)[0].colour;
    expect(tube(lit.solid, 2)).not.toEqual(tube(dark.solid, 2));
    expect(tube(lit.solid, 0)).toEqual(tube(dark.solid, 0));
    const sign = (solid: Solid, gate: number) => corners(solid, MOVING_PARTS[4].first + gate * 6, 1)[0].glow;
    expect(sign(lit.solid, 2)).toBeGreaterThan(sign(dark.solid, 2));
  });

  it('has a pin for every pin of the 2D panel, and the bulbs in their rows', () => {
    fakeDocument();
    const beads = createRows(BEAD_STRIDE, 16);
    const flat = new Flat(16);
    buildLamps(beads, flat, 40, 1, false);
    const bulbs = LAMP_ROWS.top + LAMP_ROWS.rail * 2 + LAMP_ROWS.tray + LAMP_ROWS.face;
    expect(beads.count).toBe(pinSpots().length + bulbs);
    expect(pinSpots()).toHaveLength(65);
    // Every bulb lights the surface it is on: one round touch each.
    expect(flat.count).toBe(bulbs * 6);
    const kinds = Array.from({ length: beads.count }, (_, index) => beads.data[index * BEAD_STRIDE + 7]);
    expect(kinds.filter((kind) => kind === BEAD.pin)).toHaveLength(65);
    for (const kind of kinds.slice(65)) {
      expect(kind).toBeGreaterThanOrEqual(2);
      expect(kind).toBeLessThanOrEqual(3);
    }
    // The glow travels: a third of a cycle from one bulb to the next, so every third bulb is as bright.
    const top = kinds.slice(65, 65 + LAMP_ROWS.top);
    expect(top[3]).toBeCloseTo(top[0], 5);
    expect(top[1]).not.toBeCloseTo(top[0], 2);
    // With motion reduced the wave stands still at its start, and the pusher's bulbs still ride on its face.
    const calm = createRows(BEAD_STRIDE, 256);
    buildLamps(calm, new Flat(1200), 31, 0, false);
    buildLamps(beads, flat.clear(), 31, 0, false);
    expect(Array.from(calm.data.subarray(0, calm.count * BEAD_STRIDE))).toEqual(Array.from(beads.data.subarray(0, beads.count * BEAD_STRIDE)));
    const face = (beads.count - 1) * BEAD_STRIDE;
    expect(beads.data[face + 2]).toBeGreaterThan(31);
    expect(beads.data[face + 2]).toBeLessThan(31.5);
    // A fever or a jackpot changes the colours of the lamps and nothing else.
    const party = createRows(BEAD_STRIDE, 256);
    buildLamps(party, new Flat(1200), 31, 0, true);
    expect(party.count).toBe(beads.count);
    expect(Array.from(party.data.subarray(65 * BEAD_STRIDE, 70 * BEAD_STRIDE))).not.toEqual(Array.from(beads.data.subarray(65 * BEAD_STRIDE, 70 * BEAD_STRIDE)));
  });

  it('lays the aim guide on the back panel only when it is asked for', () => {
    fakeDocument();
    const machine = createMachine(3);
    const touches = (showGuide: boolean, aim = 50) => {
      const flat = new Flat(600);
      buildTouches(flat, machine, pusherFront(0), createStage(1, false), { aim, showGuide });
      return flat;
    };
    /** Whether some touch has a corner on the back panel at the height a medal drops off an arm, this far across. */
    const tipAt = (flat: Flat, x: number) =>
      Array.from({ length: flat.count }, (_, i) => i * FLAT_STRIDE).some((at) => Math.abs(flat.data[at] - x) < 1e-4 && Math.abs(flat.data[at + 1] - ARMS.tip) < 1e-6 && Math.abs(flat.data[at + 2] - 0.1) < 1e-6);
    // The aim is to the left, and the left arm has not swung there yet: the guide hangs under its tip, where a medal would leave now.
    aimArms(machine, 30);
    const without = touches(false, 30);
    const before = touches(true, 30);
    expect(before.count - without.count).toBe(3);
    expect(machine.tips[0]).not.toBe(30);
    expect(tipAt(before, machine.tips[0])).toBe(true);
    expect(tipAt(before, 30)).toBe(false);
    expect(tipAt(without, machine.tips[0])).toBe(false);
    // Once the machine has swung the arm over the aim, the guide is over the aim too.
    step(machine, 1);
    const withGuide = touches(true, 30);
    expect(machine.tips[0]).toBe(30);
    expect(tipAt(withGuide, 30)).toBe(true);
    // A touch either hides what is under it or adds light to it; its shape is one of the three.
    for (let i = 0; i < withGuide.count; i++) {
      const at = i * FLAT_STRIDE;
      expect(withGuide.data[at + 6]).toBeGreaterThanOrEqual(0);
      expect(withGuide.data[at + 6]).toBeLessThanOrEqual(1);
      expect(withGuide.data[at + 7]).toBeGreaterThanOrEqual(0);
      expect(Object.values(SHAPE)).toContain(withGuide.data[at + 10]);
    }
  });

  it('lights a gutter for a moment when a medal has gone out by it', () => {
    fakeDocument();
    const machine = holding([lying(1, 99, 90, 0)]);
    const stage = createStage(1, false);
    trackMedals(stage, machine, 0);
    const before = new Flat(600);
    buildTouches(before, machine, 40, stage, { aim: 50, showGuide: false });
    // The medal leaves by the right side.
    machine.medals = [];
    trackMedals(stage, machine, 0);
    expect(stage.sideGlow[1]).toBeGreaterThan(0);
    const after = new Flat(600);
    buildTouches(after, machine, 40, stage, { aim: 50, showGuide: false });
    expect(after.count).toBe(before.count + 6);
    ageStage(stage, 1);
    const later = new Flat(600);
    buildTouches(later, machine, 40, stage, { aim: 50, showGuide: false });
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
    // Eight programs of two shaders each, the pictures and the relief and the shadow map, and one framebuffer for it.
    expect(held.Program).toBe(8);
    expect(held.Shader).toBe(16);
    expect(held.Texture).toBe(9);
    expect(held.Framebuffer).toBe(1);
    expect(held.Buffer).toBeGreaterThan(10);
    expect(held.VertexArray).toBeGreaterThan(5);

    const machine = createMachine(7, 2);
    const stage = createStage(1, false);
    trackMedals(stage, machine, 0);
    const before = { ...fake.calls };
    scene.draw(stage, machine, { aim: 50, showGuide: true });
    const during = (name: string) => (fake.calls[name] ?? 0) - (before[name] ?? 0);
    expect(scene.last.medals).toBe(machine.medals.length - 2);
    expect(scene.last.balls).toBe(2);
    // The medals: once into the shadow map, once into the picture. The balls the same, and the pins and bulbs once.
    expect(during('drawElementsInstanced')).toBe(5);
    // The contact shadows are one more call for all the medals together.
    expect(during('drawArraysInstanced')).toBe(1);
    expect(scene.last.calls).toBeLessThan(20);
    expect(during('drawElementsInstanced') + during('drawArraysInstanced') + during('drawArrays')).toBe(scene.last.calls);
    // One upload for the medals, and one for each of the four other lists that change.
    expect(during('bufferData')).toBe(5);
    // Nothing is made while drawing.
    expect(fake.alive()).toEqual(held);

    // A second frame with a medal on an arm and a gate lit makes nothing either, and a third with the medal in the air.
    dropMedal(machine, 30);
    step(machine, 0.1);
    lightGate(stage, 1);
    scene.draw(stage, machine, { aim: 30, showGuide: false, calm: true });
    expect(fake.alive()).toEqual(held);
    expect(machine.rolling).toHaveLength(1);
    expect(scene.last.medals).toBe(machine.medals.length - 2 + 1);
    step(machine, ROLL_TIME);
    scene.draw(stage, machine, { aim: 30, showGuide: false, calm: true });
    expect(machine.falling).toHaveLength(1);
    expect(scene.last.medals).toBe(machine.medals.length - 2 + 1);
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
    for (let frame = 0; frame < 3; frame++) scene.draw(stage, machine, { aim: 50, showGuide: true });
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
    expect(facing).toHaveLength(3);
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
    expect(sceneContext(false).alpha).toBe(false);
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
  const options = { aim: 50, showGuide: true };

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
    // On the field's canvas only the glass is drawn, over a clear sheet: no background, no medal stamped.
    expect(flat.calls.clearRect).toBe(1);
    expect(flat.calls.fillRect).toBe(1);
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
    renderer.draw(stage, machine, { aim: 50, showGuide: true });
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
