import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, armCollar, armRest, armTip, rollingSpot } from '@/components/game/MedalPusher/arms';
import {
  AIM,
  ARM_REACH,
  CHECKERS,
  FALL_TIME,
  FIELD,
  MEDAL_RADIUS,
  ROLL_TIME,
  SWEEP,
  aimArms,
  checkerCentres,
  createMachine,
  dropMedal,
  step,
  type Machine,
} from '@/components/game/MedalPusher/engine';
import { ageStage, createStage, drawField, lightGate, trackMedals } from '@/components/game/MedalPusher/render';
import { HEIGHT, project, rise, unprojectPanel } from '@/components/game/MedalPusher/view';

/** A medal's face as it was stamped on the canvas: where its middle is, how wide and how tall it was drawn, and how far it was turned. */
interface Stamp {
  x: number;
  y: number;
  width: number;
  height: number;
  turn: number;
}

/**
 * A stand-in for a canvas's 2D context. It draws nothing and remembers what
 * the tests look for: every piece of text, at the pixel it was drawn, every
 * point a path was started from or carried on to, and every image stamped.
 */
function recorder() {
  const texts: { text: string; x: number; y: number }[] = [];
  const starts: { x: number; y: number }[] = [];
  const lines: { x: number; y: number }[] = [];
  const stamps: Stamp[] = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const at = (x: number, y: number) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  const gradient = { addColorStop: () => undefined };
  const own: Record<string, unknown> = {
    setTransform: (...values: number[]) => {
      matrix = values;
    },
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, ...at(x, y) });
    },
    moveTo: (x: number, y: number) => {
      starts.push(at(x, y));
    },
    lineTo: (x: number, y: number) => {
      lines.push(at(x, y));
    },
    drawImage: () => {
      // A sprite is stamped on a square of two units about the origin: the transform says the rest.
      const [a, b, c, d, x, y] = matrix;
      stamps.push({ x, y, width: Math.hypot(a, c), height: Math.hypot(b, d), turn: Math.atan2(-c, a) });
    },
  };
  // Everything else a context can do is accepted and ignored; the two calls that return something return a gradient.
  const context = new Proxy(own, {
    get: (target, name: string) => target[name] ?? (() => gradient),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { context, texts, starts, lines, stamps };
}

type Recorder = ReturnType<typeof recorder>;

/** Lets the stage make its off-screen canvases without a browser, and hands back what was drawn on them. */
function fakeDocument(): Recorder[] {
  const made: Recorder[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = recorder();
      made.push(canvas);
      return { width: 0, height: 0, getContext: () => canvas.context };
    },
  });
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the gates on the canvas', () => {
  /** One frame of the field at `time`, and what it drew. */
  const frame = (time: number, calm: boolean) => {
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = time;
    const screen = recorder();
    drawField(screen.context, stage, machine, { aim: 50, showGuide: true, calm });
    return screen;
  };
  /** A quarter of the way through the sweep, an eighth, the far left, and somewhere on the way back. */
  const TIMES = [0, SWEEP.period / 8, SWEEP.period / 4, 2.2, (SWEEP.period * 3) / 4, 5.3];

  it('paints no gate sign into the layer that is drawn once', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => canvas.texts.map((entry) => entry.text));
    // The words on the table are there, so the layer was recorded; the signs are not.
    expect(once.filter((text) => text === 'GET')).toHaveLength(3);
    expect(once.filter((text) => text === 'OUT')).toHaveLength(2);
    expect(once).not.toContain('START');
  });

  it('draws every START sign over its gate, wherever the sweep has taken it', () => {
    fakeDocument();
    const heights: number[] = [];
    for (const time of TIMES) {
      const signs = frame(time, false).texts.filter((entry) => entry.text === 'START');
      expect(signs).toHaveLength(CHECKERS.positions.length);
      const centres = checkerCentres(time);
      signs.forEach((sign, gate) => {
        // The spot of the back panel the sign was drawn on: straight above the gate's centre.
        const spot = unprojectPanel(sign.x, sign.y);
        expect(spot?.x).toBeCloseTo(centres[gate], 6);
        heights.push(spot?.height ?? Number.NaN);
      });
    }
    // Always at the same height on the panel: above the pusher, below the top of the wall.
    for (const height of heights) {
      expect(height).toBeCloseTo(heights[0], 6);
      expect(height).toBeGreaterThan(HEIGHT.pusher);
      expect(height).toBeLessThan(HEIGHT.wall);
    }
  });

  it('draws every gate where a medal has to land to go through it', () => {
    fakeDocument();
    // A gate's opening is as wide as a medal that just goes through on either side.
    const halfWidth = MEDAL_RADIUS + CHECKERS.halfWidth;
    const near = (points: { x: number; y: number }[], x: number, y: number) => points.some((point) => Math.hypot(point.x - x, point.y - y) < 1e-6);
    for (const time of TIMES) {
      const { starts } = frame(time, false);
      for (const centre of checkerCentres(time)) {
        const corner = project(centre - halfWidth, HEIGHT.pusher, 0);
        expect(near(starts, corner.x, corner.y)).toBe(true);
      }
      // And nowhere else: away from the middle of the sweep, nothing is left behind where the gates used to stand.
      if (Math.abs(checkerCentres(time)[0] - CHECKERS.positions[0]) > 0.5) {
        for (const centre of CHECKERS.positions) {
          const corner = project(centre - halfWidth, HEIGHT.pusher, 0);
          expect(near(starts, corner.x, corner.y)).toBe(false);
        }
      }
    }
  });

  it('moves the gates and their signs with reduced motion too', () => {
    fakeDocument();
    for (const time of TIMES) {
      const moving = frame(time, false).texts.filter((entry) => entry.text === 'START');
      const calm = frame(time, true).texts.filter((entry) => entry.text === 'START');
      expect(calm).toEqual(moving);
    }
    const middle = frame(0, true).texts.find((entry) => entry.text === 'START');
    const right = frame(SWEEP.period / 4, true).texts.find((entry) => entry.text === 'START');
    expect((right?.x ?? 0) - (middle?.x ?? 0)).toBeGreaterThan(SWEEP.amplitude);
  });

  it('lights a gate that a medal has come through, wherever it is', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = SWEEP.period / 4;
    lightGate(stage, 2);
    expect(stage.gateGlow).toEqual([0, 0, expect.any(Number)]);
    expect(stage.gateGlow[2]).toBeGreaterThan(0);
    lightGate(stage, 7);
    expect(stage.gateGlow).toHaveLength(CHECKERS.positions.length);
    const screen = recorder();
    expect(() => drawField(screen.context, stage, machine, { aim: 50, showGuide: false })).not.toThrow();
    expect(screen.texts.filter((entry) => entry.text === 'START')).toHaveLength(3);
  });
});

describe('the feed arms on the canvas', () => {
  const near = (points: { x: number; y: number }[], x: number, y: number, within = 1e-6) => points.some((point) => Math.hypot(point.x - x, point.y - y) < within);
  /** A stage that has looked at the machine, so that its arms are where they belong, and one frame of it. */
  const frame = (machine: Machine, showGuide = false) => {
    const stage = createStage(1);
    trackMedals(stage, machine);
    const screen = recorder();
    drawField(screen.context, stage, machine, { aim: machine.aim, showGuide });
    return { stage, ...screen };
  };
  /** The medal stamped nearest a place in the cabinet, and how far off that place it is, in pixels. */
  const stampAt = (stamps: Stamp[], x: number, height: number, depth: number) => {
    const point = project(x, height, depth);
    const off = (stamp: Stamp) => Math.hypot(stamp.x - point.x, stamp.y - point.y);
    const stamp = [...stamps].sort((a, b) => off(a) - off(b))[0];
    return { stamp, off: off(stamp) };
  };
  /** How round a medal standing on its edge with its face to the player is drawn. */
  const upright = rise(project(50, 30, 1)) / project(50, 30, 1).scale;
  /** How near a tip, in pixels, the hood that ends its rail is drawn. */
  const hood = (MEDAL_RADIUS + 1.5) * project(50, ARMS.tip, ARMS.depth).scale;

  it('draws no chute over the aim any more, and both arms from their corners', () => {
    fakeDocument();
    const machine = createMachine(3);
    aimArms(machine, 12);
    const { lines, starts } = frame(machine);
    // The chute's upper corners were on the top edge of the panel, to either side of the aim.
    for (const side of [-5, 5]) {
      const corner = project(12 + side, HEIGHT.wall + 2, 0);
      expect(near([...starts, ...lines], corner.x, corner.y, 2)).toBe(false);
    }
    // Each rail ends in a hood round its tip: the left one over the aim, the right one where it rests.
    for (const tipX of [12, armRest(1)]) {
      const tip = project(tipX, ARMS.tip, ARMS.depth);
      expect(lines.filter((point) => Math.hypot(point.x - tip.x, point.y - tip.y) < hood).length).toBeGreaterThan(8);
    }
    // And nothing is drawn where the left arm would be resting.
    const rest = project(armRest(0), ARMS.tip, ARMS.depth);
    expect(lines.filter((point) => Math.hypot(point.x - rest.x, point.y - rest.y) < hood)).toEqual([]);
  });

  it('paints nothing of the arms into the layer that is drawn once: they move', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => [...canvas.starts, ...canvas.lines]);
    expect(once.length).toBeGreaterThan(0);
    for (const tipX of [armRest(0), armRest(1), FIELD.width / 2]) {
      const tip = project(tipX, ARMS.tip, ARMS.depth);
      expect(once.filter((point) => Math.hypot(point.x - tip.x, point.y - tip.y) < hood)).toEqual([]);
    }
    expect(armCollar(0).height).toBeGreaterThan(ARMS.tip);
  });

  it('has the arm on the side of the aim over it, wherever the aim is, and the other at rest', () => {
    fakeDocument();
    for (const aim of [AIM.min, 20, 49, 50, 63, AIM.max]) {
      const machine = createMachine(3);
      aimArms(machine, aim);
      const { stage } = frame(machine);
      expect(stage.arms).toEqual(aim < FIELD.width / 2 ? [aim, armRest(1)] : [armRest(0), aim]);
    }
  });

  it('draws a medal on a rail where it has rolled to, standing on its edge with its face to the player', () => {
    fakeDocument();
    for (const [aim, arm] of [[30, 0], [70, 1]] as const) {
      const machine = createMachine(3);
      dropMedal(machine, aim);
      step(machine, 0.3);
      const [medal] = machine.rolling;
      const spot = rollingSpot(arm, aim, medal.remaining);
      const { stamp, off } = stampAt(frame(machine).stamps, spot.x, spot.height, spot.depth);
      expect(off).toBeLessThan(1e-6);
      // As wide as a medal, and as tall as one seen face on from the camera's height: rounder than one lying flat back there.
      expect(stamp.width).toBeCloseTo(MEDAL_RADIUS * project(spot.x, spot.height, spot.depth).scale, 6);
      expect(stamp.height / stamp.width).toBeCloseTo(upright, 6);
      expect(upright).toBeGreaterThan(project(spot.x, HEIGHT.pusher, 10).tilt + 0.1);
    }
  });

  it('turns a medal as it rolls: one way down the left arm, the other way down the right', () => {
    fakeDocument();
    const after = (aim: number, arm: 0 | 1, seconds: number) => {
      const machine = createMachine(3);
      dropMedal(machine, aim);
      step(machine, seconds);
      const spot = rollingSpot(arm, aim, machine.rolling[0].remaining);
      return { turn: stampAt(frame(machine).stamps, spot.x, spot.height, spot.depth).stamp.turn, turned: spot.turned };
    };
    /** The difference between two angles, the short way round. */
    const between = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    for (const [aim, arm] of [[40, 0], [60, 1]] as const) {
      const early = after(aim, arm, 0.2);
      const later = after(aim, arm, 0.2 + 2 / 60);
      // Drawn turned by exactly as much as it rolled between the two frames.
      expect(between(later.turn, early.turn)).toBeCloseTo(later.turned - early.turned, 6);
      expect(Math.sign(later.turned - early.turned)).toBe(arm === 0 ? 1 : -1);
      expect(Math.abs(later.turned - early.turned)).toBeGreaterThan(0.1);
    }
  });

  it('draws every medal of a stream on its rail, the first fed the furthest down', () => {
    fakeDocument();
    const machine = createMachine(3);
    for (let i = 0; i < 28; i++) {
      dropMedal(machine, 40);
      step(machine, 1 / 60);
    }
    expect(machine.rolling).toHaveLength(3);
    const { stamps } = frame(machine);
    const drawn = machine.rolling.map((medal) => {
      const spot = rollingSpot(0, 40, medal.remaining);
      const { stamp, off } = stampAt(stamps, spot.x, spot.height, spot.depth);
      expect(off).toBeLessThan(1e-6);
      return stamp;
    });
    // Further down the rail is further right and lower on the drawing.
    expect(drawn[0].x).toBeGreaterThan(drawn[1].x);
    expect(drawn[1].x).toBeGreaterThan(drawn[2].x);
    expect(drawn[0].y).toBeGreaterThan(drawn[1].y);
    expect(drawn[1].y).toBeGreaterThan(drawn[2].y);
  });

  it('lets a medal go without a jump: its last frame on the rail and its first in the air are the same picture', () => {
    fakeDocument();
    for (const aim of [25, 50, 75]) {
      const machine = createMachine(3);
      dropMedal(machine, aim);
      step(machine, ROLL_TIME - 1e-4);
      expect(machine.rolling).toHaveLength(1);
      const tip = armTip(aim < FIELD.width / 2 ? 0 : 1, aim);
      const last = stampAt(frame(machine).stamps, tip.x, tip.height, tip.depth);
      step(machine, 2e-4);
      expect(machine.rolling).toHaveLength(0);
      expect(machine.falling).toHaveLength(1);
      expect(machine.falling[0].remaining).toBeGreaterThan(FALL_TIME - 1e-3);
      const first = stampAt(frame(machine).stamps, tip.x, tip.height, tip.depth);
      // Both are at the tip, to a fraction of a pixel, as round as each other and turned the same way.
      expect(last.off).toBeLessThan(0.2);
      expect(first.off).toBeLessThan(0.2);
      expect(first.stamp.width).toBeCloseTo(last.stamp.width, 1);
      expect(first.stamp.height / first.stamp.width).toBeCloseTo(last.stamp.height / last.stamp.width, 2);
      expect(Math.abs(Math.sin(first.stamp.turn - last.stamp.turn))).toBeLessThan(0.01);
    }
  });

  it('swings a tip to where it belongs over a few frames, and has it there at once without motion', () => {
    fakeDocument();
    const machine = createMachine(3);
    aimArms(machine, 70);
    // A stage that sees the machine for the first time finds the arms already in place.
    const stage = createStage(1);
    expect(stage.arms).toEqual([armRest(0), armRest(1)]);
    trackMedals(stage, machine);
    expect(stage.arms).toEqual([armRest(0), 70]);
    // The aim jumps to the far left: both arms set off, each at the arms' speed, and get there.
    aimArms(machine, 10);
    trackMedals(stage, machine);
    expect(stage.arms).toEqual([armRest(0), 70]);
    ageStage(stage, 1 / 60);
    expect(stage.arms[0]).toBeCloseTo(armRest(0) - ARMS.speed / 60, 9);
    expect(stage.arms[1]).toBeCloseTo(70 - ARMS.speed / 60, 9);
    for (let i = 0; i < 30; i++) {
      trackMedals(stage, machine);
      ageStage(stage, 1 / 60);
    }
    expect(stage.arms).toEqual([10, armRest(1)]);
    // An aim that moves no faster than the arms is followed exactly.
    for (let i = 0; i < 20; i++) {
      aimArms(machine, 10 + i);
      trackMedals(stage, machine);
      ageStage(stage, 1 / 60);
      expect(stage.arms[0]).toBe(10 + i);
    }
    // With reduced motion there is no swing: the tip is simply where it belongs.
    aimArms(machine, 90);
    trackMedals(stage, machine);
    ageStage(stage, 1 / 60, true);
    expect(stage.arms).toEqual([armRest(0), 90]);
  });

  it('keeps an arm over the aim past the middle while a medal is on its rail, and draws the medal on it there', () => {
    fakeDocument();
    const machine = createMachine(3);
    dropMedal(machine, 45);
    step(machine, 0.2);
    aimArms(machine, 58);
    const stage = createStage(1);
    trackMedals(stage, machine);
    expect(stage.arms).toEqual([58, 58]);
    const screen = recorder();
    drawField(screen.context, stage, machine, { aim: 58, showGuide: false });
    const spot = rollingSpot(0, 58, machine.rolling[0].remaining);
    expect(stampAt(screen.stamps, spot.x, spot.height, spot.depth).off).toBeLessThan(1e-6);
    // Beyond its reach it stops, and that is where the medal will be let go.
    aimArms(machine, 85);
    trackMedals(stage, machine);
    ageStage(stage, 1, true);
    expect(stage.arms).toEqual([ARM_REACH[0].max, 85]);
  });

  it('shows under the tip how far from it a medal can land, when it is asked to', () => {
    fakeDocument();
    const machine = createMachine(3);
    aimArms(machine, 40);
    const apex = project(40, ARMS.tip, 0);
    expect(near(frame(machine, true).starts, apex.x, apex.y)).toBe(true);
    expect(near(frame(machine, false).starts, apex.x, apex.y)).toBe(false);
  });
});
