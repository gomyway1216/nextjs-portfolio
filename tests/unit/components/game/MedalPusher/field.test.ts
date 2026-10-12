import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, armCollar, armRest, armTip, rollingSpot } from '@/components/game/MedalPusher/arms';
import {
  AIM,
  ARM_REACH,
  FALL_TIME,
  FIELD,
  MEDAL_RADIUS,
  ROLL_TIME,
  aimArms,
  createMachine,
  dropMedal,
  step,
  type Machine,
} from '@/components/game/MedalPusher/engine';
import { GATE, createStage, drawField, lightGate } from '@/components/game/MedalPusher/render';
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
  /** Moments all through the pusher's stroke: the gates are the same picture at every one. */
  const TIMES = [0, 0.75, 1.5, 2.2, 4.5, 5.3];

  it('paints no gate sign into the layer that is drawn once', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => canvas.texts.map((entry) => entry.text));
    // The words on the table are there, so the layer was recorded; the signs are not.
    expect(once.filter((text) => text === 'GET')).toHaveLength(3);
    expect(once.filter((text) => text === 'OUT')).toHaveLength(2);
    expect(once).not.toContain('START');
  });

  it('draws every START sign over its gate, and the gates stand still', () => {
    fakeDocument();
    const heights: number[] = [];
    for (const time of TIMES) {
      const signs = frame(time, false).texts.filter((entry) => entry.text === 'START');
      expect(signs).toHaveLength(GATE.positions.length);
      signs.forEach((sign, gate) => {
        // The spot of the back panel the sign was drawn on: straight above the gate's centre, whatever the time.
        const spot = unprojectPanel(sign.x, sign.y);
        expect(spot?.x).toBeCloseTo(GATE.positions[gate], 6);
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

  it('draws every gate where it stands at the foot of the back panel', () => {
    fakeDocument();
    expect(GATE.positions).toEqual([25, 50, 75]);
    const near = (points: { x: number; y: number }[], x: number, y: number) => points.some((point) => Math.hypot(point.x - x, point.y - y) < 1e-6);
    for (const time of TIMES) {
      const { starts } = frame(time, false);
      for (const centre of GATE.positions) {
        const corner = project(centre - GATE.halfWidth, HEIGHT.pusher, 0);
        expect(near(starts, corner.x, corner.y)).toBe(true);
      }
    }
    // The openings do not run into one another, and none runs off the panel.
    expect(GATE.positions[1] - GATE.positions[0]).toBeGreaterThan(GATE.halfWidth * 2);
    expect(GATE.positions[0] - GATE.halfWidth).toBeGreaterThan(0);
    expect(GATE.positions[2] + GATE.halfWidth).toBeLessThan(FIELD.width);
  });

  it('draws the gates and their signs the same with reduced motion, and the same from one moment to the next', () => {
    fakeDocument();
    const signsAt = (time: number, calm: boolean) => frame(time, calm).texts.filter((entry) => entry.text === 'START');
    for (const time of TIMES) {
      expect(signsAt(time, true)).toEqual(signsAt(time, false));
      expect(signsAt(time, true)).toEqual(signsAt(0, true));
    }
  });

  it('lights the gate of the number it is told, and no other', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    lightGate(stage, 2);
    expect(stage.gateGlow).toEqual([0, 0, expect.any(Number)]);
    expect(stage.gateGlow[2]).toBeGreaterThan(0);
    lightGate(stage, 7);
    expect(stage.gateGlow).toHaveLength(GATE.positions.length);
    const screen = recorder();
    expect(() => drawField(screen.context, stage, machine, { aim: 50, showGuide: false })).not.toThrow();
    expect(screen.texts.filter((entry) => entry.text === 'START')).toHaveLength(3);
  });
});

describe('the feed arms on the canvas', () => {
  const near = (points: { x: number; y: number }[], x: number, y: number, within = 1e-6) => points.some((point) => Math.hypot(point.x - x, point.y - y) < within);
  /** One frame of the machine as it stands, and what it drew. The arms are drawn from the machine: the stage keeps nothing of them. */
  const frame = (machine: Machine, showGuide = false, calm = false) => {
    const stage = createStage(1);
    const screen = recorder();
    drawField(screen.context, stage, machine, { aim: machine.aim, showGuide, calm });
    return screen;
  };
  /** Points the arms and gives them time to get there. Nothing else moves: the machine has not been fed. */
  const point = (machine: Machine, aim: number): void => {
    aimArms(machine, aim);
    step(machine, 0.5);
  };
  /** The medal stamped nearest a place in the cabinet, and how far off that place it is, in pixels. */
  const stampAt = (stamps: Stamp[], x: number, height: number, depth: number) => {
    const spot = project(x, height, depth);
    const off = (stamp: Stamp) => Math.hypot(stamp.x - spot.x, stamp.y - spot.y);
    const stamp = [...stamps].sort((a, b) => off(a) - off(b))[0];
    return { stamp, off: off(stamp) };
  };
  /** How round a medal standing on its edge with its face to the player is drawn. */
  const upright = rise(project(50, 30, 1)) / project(50, 30, 1).scale;
  /** How near a tip, in pixels, the hood that ends its rail is drawn, and how many of the hood's points are that near a place across the field. */
  const hood = (MEDAL_RADIUS + 1.5) * project(50, ARMS.tip, ARMS.depth).scale;
  const hoodAt = (lines: { x: number; y: number }[], tipX: number): number => {
    const tip = project(tipX, ARMS.tip, ARMS.depth);
    return lines.filter((line) => Math.hypot(line.x - tip.x, line.y - tip.y) < hood).length;
  };

  it('draws no chute over the aim any more, and both arms from their corners', () => {
    fakeDocument();
    const machine = createMachine(3);
    point(machine, 12);
    expect(machine.tips).toEqual([12, armRest(1)]);
    const { lines, starts } = frame(machine);
    // The chute's upper corners were on the top edge of the panel, to either side of the aim.
    for (const side of [-5, 5]) {
      const corner = project(12 + side, HEIGHT.wall + 2, 0);
      expect(near([...starts, ...lines], corner.x, corner.y, 2)).toBe(false);
    }
    // Each rail ends in a hood round its tip: the left one over the aim, the right one where it rests.
    expect(hoodAt(lines, 12)).toBeGreaterThan(8);
    expect(hoodAt(lines, armRest(1))).toBeGreaterThan(8);
    // And nothing is drawn where the left arm would be resting.
    expect(hoodAt(lines, armRest(0))).toBe(0);
  });

  it('paints nothing of the arms into the layer that is drawn once: they move', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => [...canvas.starts, ...canvas.lines]);
    expect(once.length).toBeGreaterThan(0);
    for (const tipX of [armRest(0), armRest(1), FIELD.width / 2]) expect(hoodAt(once, tipX)).toBe(0);
    expect(armCollar(0).height).toBeGreaterThan(ARMS.tip);
  });

  it('draws each arm where the machine has its tip, wherever the aim is', () => {
    fakeDocument();
    for (const aim of [AIM.min, 20, 49, 50, 63, AIM.max]) {
      const machine = createMachine(3);
      point(machine, aim);
      expect(machine.tips).toEqual(aim < FIELD.width / 2 ? [aim, armRest(1)] : [armRest(0), aim]);
      const { lines } = frame(machine);
      for (const tipX of machine.tips) expect(hoodAt(lines, tipX)).toBeGreaterThan(8);
    }
  });

  it('draws a medal on a rail where it has rolled to, standing on its edge with its face to the player', () => {
    fakeDocument();
    for (const [aim, arm] of [[30, 0], [70, 1]] as const) {
      const machine = createMachine(3);
      dropMedal(machine, aim);
      step(machine, 0.3);
      expect(machine.tips[arm]).toBe(aim);
      const [medal] = machine.rolling;
      const spot = rollingSpot(arm, machine.tips[arm], medal.remaining);
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
      const spot = rollingSpot(arm, machine.tips[arm], machine.rolling[0].remaining);
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
      const spot = rollingSpot(0, machine.tips[0], medal.remaining);
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

  it('draws an arm in the middle of its swing where the machine has it, medal and all, and the same with reduced motion', () => {
    fakeDocument();
    const machine = createMachine(3);
    point(machine, 12);
    // A medal goes into the left arm, and the aim jumps across the field: the arm sets off after it.
    dropMedal(machine, 12);
    aimArms(machine, 90);
    step(machine, 4 / 60);
    const [left, right] = machine.tips;
    expect(left).toBeCloseTo(12 + (4 * ARMS.speed) / 60, 9);
    expect(left).toBeLessThan(ARM_REACH[0].max - 20);
    expect(right).toBeGreaterThan(armRest(1));
    expect(right).toBeLessThan(90);
    const spot = rollingSpot(0, left, machine.rolling[0].remaining);
    const pictures = [false, true].map((calm) => {
      const { lines, stamps } = frame(machine, false, calm);
      // Each hood is round its tip as it is now, and the medal is on the rail as it is now: neither where it set off nor where it is going.
      expect(hoodAt(lines, left)).toBeGreaterThan(8);
      expect(hoodAt(lines, right)).toBeGreaterThan(8);
      expect(stampAt(stamps, spot.x, spot.height, spot.depth).off).toBeLessThan(1e-6);
      for (const tipX of [12, ARM_REACH[0].max]) {
        const elsewhere = rollingSpot(0, tipX, machine.rolling[0].remaining);
        expect(stampAt(stamps, elsewhere.x, elsewhere.height, elsewhere.depth).off).toBeGreaterThan(1);
      }
      const tip = project(left, ARMS.tip, ARMS.depth);
      return lines.filter((line) => Math.hypot(line.x - tip.x, line.y - tip.y) < hood);
    });
    // The arms are part of the machine, like the gates: with reduced motion the hood is drawn in the very same place.
    expect(pictures[1]).toEqual(pictures[0]);
  });

  it('lets a medal go from the tip as it is drawn when the aim jumps just as it gets there', () => {
    fakeDocument();
    const machine = createMachine(3);
    machine.rng = () => 0.5;
    point(machine, 10);
    dropMedal(machine, 10);
    step(machine, ROLL_TIME - 1 / 60);
    expect(machine.tips[0]).toBe(10);
    // The aim jumps to the far side in the very step the medal reaches the end of its rail.
    aimArms(machine, 90);
    step(machine, 1 / 60);
    expect(machine.rolling).toEqual([]);
    const [medal] = machine.falling;
    // The arm has had one step to swing in: it is nowhere near the end of its reach, and the medal left from where it is.
    expect(machine.tips[0]).toBeCloseTo(10 + ARMS.speed / 60, 9);
    expect(machine.tips[0]).toBeLessThan(ARM_REACH[0].max - 40);
    expect(medal.fromX).toBe(machine.tips[0]);
    expect(medal.x).toBe(machine.tips[0]);
    // In this frame the end of the rail and the medal that has just left it are drawn in one place, to the last digit.
    const { lines, stamps } = frame(machine);
    const tip = armTip(0, machine.tips[0]);
    expect(tip.x).toBe(medal.fromX);
    expect(tip.depth).toBe(medal.fromY);
    expect(stampAt(stamps, tip.x, tip.height, tip.depth).off).toBeLessThan(1e-9);
    expect(hoodAt(lines, medal.fromX)).toBeGreaterThan(8);
    // Nothing is in the air at the end of the arm's reach, where the aim alone would have put it.
    const reach = armTip(0, 90);
    expect(reach.x).toBe(ARM_REACH[0].max);
    expect(stampAt(stamps, reach.x, reach.height, reach.depth).off).toBeGreaterThan(40);
    expect(hoodAt(lines, reach.x)).toBe(0);
  });

  it('keeps an arm over the aim past the middle while a medal is on its rail, and draws the medal on it there', () => {
    fakeDocument();
    const machine = createMachine(3);
    dropMedal(machine, 45);
    step(machine, 0.1);
    aimArms(machine, 58);
    step(machine, 0.1);
    expect(machine.tips).toEqual([58, 58]);
    const spot = rollingSpot(0, 58, machine.rolling[0].remaining);
    expect(stampAt(frame(machine).stamps, spot.x, spot.height, spot.depth).off).toBeLessThan(1e-6);
  });

  it('shows under the tip how far from it a medal can land, when it is asked to', () => {
    fakeDocument();
    const machine = createMachine(3);
    point(machine, 40);
    const apex = project(40, ARMS.tip, 0);
    expect(near(frame(machine, true).starts, apex.x, apex.y)).toBe(true);
    expect(near(frame(machine, false).starts, apex.x, apex.y)).toBe(false);
    // It hangs under the tip of the arm that takes the next medal, so while that arm is still on its way to an aim
    // that has jumped, it is where a medal leaving now would be let go, not where the aim is.
    aimArms(machine, 85);
    step(machine, 1 / 60);
    const [, right] = machine.tips;
    expect(right).toBeLessThan(85);
    const swinging = project(right, ARMS.tip, 0);
    const there = project(85, ARMS.tip, 0);
    const { starts } = frame(machine, true);
    expect(near(starts, swinging.x, swinging.y)).toBe(true);
    expect(near(starts, there.x, there.y)).toBe(false);
  });
});
