import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, SLOT, armCollar, armRest, armTip, fedSpot, legOf, letGo, railFrame, rollingSpot } from '@/components/game/MedalPusher/arms';
import {
  AIM,
  ARM_REACH,
  CHECKERS,
  FALL_TIME,
  FIELD,
  MEDAL_RADIUS,
  FEED,
  ROLL_TIME,
  SWEEP,
  aimArms,
  checkerCentres,
  createMachine,
  dropMedal,
  step,
  type Arm,
  type Machine,
} from '@/components/game/MedalPusher/engine';
import { createStage, drawField, lightGate } from '@/components/game/MedalPusher/render';
import { HEIGHT, HOUSING, project, unprojectPanel } from '@/components/game/MedalPusher/view';

/**
 * A medal's face as it was stamped on the canvas: where its middle is, how wide and how tall it was drawn, how far
 * it was turned, and the two lines across its face that the canvas was told to draw it between.
 */
interface Stamp {
  x: number;
  y: number;
  width: number;
  height: number;
  turn: number;
  across: [number, number];
  down: [number, number];
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
      stamps.push({ x, y, width: Math.hypot(a, c), height: Math.hypot(b, d), turn: Math.atan2(-c, a), across: [a, b], down: [c, d] });
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
    // Always at the same height on the wall: above the pusher, under the shelf the screen stands on.
    for (const height of heights) {
      expect(height).toBeCloseTo(heights[0], 6);
      expect(height).toBeGreaterThan(HEIGHT.pusher);
      expect(height).toBeLessThan(HOUSING.shelf);
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
  /**
   * A corner of the floor of an arm's channel, on the drawing: `far` along the rail from its collar, under the edge
   * a medal stands on, on the side the medal's face looks to. The floor is 0.6 to either side of that edge, comes
   * out of the slot 3 from the collar and runs 0.6 past the tip.
   */
  const onRail = (arm: Arm, tipX: number, far: number) => {
    const rail = railFrame(arm, tipX);
    const at = (way: 'x' | 'height' | 'depth') => rail.from[way] + rail.along[way] * far + rail.foot[way] * MEDAL_RADIUS + rail.face[way] * 0.6;
    return project(at('x'), at('height'), at('depth'));
  };
  /** Whether the far end of an arm's channel was drawn where a tip over `tipX` puts it, and whether its near end was. */
  const endsAt = (points: { x: number; y: number }[], arm: Arm, tipX: number): boolean => {
    const end = onRail(arm, tipX, railFrame(arm, tipX).length + 0.6);
    return near(points, end.x, end.y);
  };
  const startsAt = (points: { x: number; y: number }[], arm: Arm, tipX: number): boolean => {
    const start = onRail(arm, tipX, 3);
    return near(points, start.x, start.y);
  };

  it('draws each arm as a rail from its slot at the front corner to its tip, and nothing where an arm is not', () => {
    fakeDocument();
    const machine = createMachine(3);
    point(machine, 12);
    expect(machine.tips).toEqual([12, armRest(1)]);
    const { lines, starts } = frame(machine);
    const drawn = [...starts, ...lines];
    // The left one ends over the aim, the right one where it rests; each begins at its own collar.
    expect(endsAt(drawn, 0, 12)).toBe(true);
    expect(endsAt(drawn, 1, armRest(1))).toBe(true);
    expect(startsAt(drawn, 0, 12)).toBe(true);
    expect(startsAt(drawn, 1, armRest(1))).toBe(true);
    // And nothing is drawn where the left arm would be resting.
    expect(endsAt(drawn, 0, armRest(0))).toBe(false);
    // The near end is by the player: low on the drawing and at its side. The far end is over the pusher, further up and nearer the middle.
    const from = onRail(0, 12, 3);
    const to = onRail(0, armRest(0), railFrame(0, armRest(0)).length);
    expect(from.y).toBeGreaterThan(to.y + 200);
    expect(from.x).toBeLessThan(to.x - 100);
  });

  it('paints nothing of the arms into the layer that is drawn once: they move', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => [...canvas.starts, ...canvas.lines]);
    expect(once.length).toBeGreaterThan(0);
    for (const arm of [0, 1] as const) {
      for (const tipX of [armRest(arm), FIELD.width / 2]) {
        expect(endsAt(once, arm, tipX)).toBe(false);
        expect(startsAt(once, arm, tipX)).toBe(false);
      }
    }
    expect(armCollar(0).height).toBeGreaterThan(ARMS.tip);
  });

  it('draws each arm where the machine has its tip, wherever the aim is', () => {
    fakeDocument();
    for (const aim of [AIM.min, 20, 49, 50, 63, AIM.max]) {
      const machine = createMachine(3);
      point(machine, aim);
      expect(machine.tips).toEqual(aim < FIELD.width / 2 ? [aim, armRest(1)] : [armRest(0), aim]);
      const { lines, starts } = frame(machine);
      for (const arm of [0, 1] as const) expect(endsAt([...starts, ...lines], arm, machine.tips[arm])).toBe(true);
    }
  });

  it('draws a medal on a rail where it has rolled to, on its edge and leaning back, its face turned to the middle', () => {
    fakeDocument();
    for (const [aim, arm] of [[30, 0], [70, 1]] as const) {
      const machine = createMachine(3);
      dropMedal(machine, aim);
      step(machine, FEED.slot + 0.4);
      expect(machine.tips[arm]).toBe(aim);
      const [medal] = machine.rolling;
      expect(legOf(medal.remaining)).toBe('arm');
      const spot = rollingSpot(arm, machine.tips[arm], medal.remaining);
      const { stamp, off } = stampAt(frame(machine).stamps, spot.x, spot.height, spot.depth);
      expect(off).toBeLessThan(1e-6);
      const full = MEDAL_RADIUS * project(spot.x, spot.height, spot.depth).scale;
      // It is not lying flat, which would be drawn as wide as a medal is; and it is not edge on, which would be a sliver.
      expect(stamp.width).toBeLessThan(full * 0.9);
      expect(stamp.width).toBeGreaterThan(full * 0.4);
      // Seen from the middle of the cabinet, more than half of its face shows: the picture has more than half a flat circle's area.
      const area = Math.abs(stamp.across[0] * stamp.down[1] - stamp.across[1] * stamp.down[0]);
      expect(area / (full * full)).toBeGreaterThan(0.5);
      // It stands more than it lies: the picture is taller than a medal lying flat there would be drawn.
      expect(stamp.height).toBeGreaterThan(full * project(spot.x, spot.height, spot.depth).tilt);
    }
  });

  it('turns a medal as it rolls, by as much as it has rolled', () => {
    fakeDocument();
    const after = (aim: number, arm: Arm, seconds: number) => {
      const machine = createMachine(3);
      dropMedal(machine, aim);
      step(machine, seconds);
      const spot = rollingSpot(arm, machine.tips[arm], machine.rolling[0].remaining);
      return { stamp: stampAt(frame(machine).stamps, spot.x, spot.height, spot.depth).stamp, turned: spot.turned };
    };
    for (const [aim, arm] of [[40, 0], [60, 1]] as const) {
      // Once it is out of the slot and leaning back in its channel.
      const early = after(aim, arm, FEED.slot + 0.3);
      const later = after(aim, arm, FEED.slot + 0.3 + 1 / 60);
      // How far the second picture is turned from the first, within the medal's own face: the first picture undone, then the second.
      const [a, b] = early.stamp.across;
      const [c, d] = early.stamp.down;
      const det = a * d - b * c;
      const cos = (d * later.stamp.across[0] - c * later.stamp.across[1]) / det;
      const sin = (-b * later.stamp.across[0] + a * later.stamp.across[1]) / det;
      // It moved a little between the two, so the two pictures are not quite one turned: near enough to tell a turn by.
      expect(Math.abs(Math.atan2(sin, cos))).toBeCloseTo(later.turned - early.turned, 1);
      expect(later.turned - early.turned).toBeGreaterThan(0.3);
    }
  });

  it('draws every medal of a stream on its way in, the first fed the furthest along', () => {
    fakeDocument();
    const machine = createMachine(3);
    for (let i = 0; i < 46; i++) {
      dropMedal(machine, 40);
      step(machine, 1 / 60);
    }
    // Five on their way in: four on the rail and one at the slot. Each is drawn where its way has taken it.
    expect(machine.rolling.map((medal) => legOf(medal.remaining))).toEqual(['arm', 'arm', 'arm', 'arm', 'slot']);
    const { stamps } = frame(machine);
    const drawn = machine.rolling.map((medal) => {
      const spot = fedSpot(0, machine.tips[0], medal.remaining);
      const { stamp, off } = stampAt(stamps, spot.x, spot.height, spot.depth);
      expect(off).toBeLessThan(1e-6);
      return stamp;
    });
    // Further along the rail is further from the player: nearer the middle and higher on the drawing, and smaller.
    for (let i = 1; i < drawn.length; i++) {
      expect(drawn[i - 1].x).toBeGreaterThan(drawn[i].x);
      expect(drawn[i - 1].y).toBeLessThan(drawn[i].y);
    }
    expect(Math.hypot(...drawn[0].across, ...drawn[0].down)).toBeLessThan(Math.hypot(...drawn[3].across, ...drawn[3].down));
  });

  it('shows a medal to the slot face on, as large as anything in the picture, and hides it once it is in', () => {
    fakeDocument();
    for (const [aim, arm] of [[30, 0], [70, 1]] as const) {
      const machine = createMachine(3);
      dropMedal(machine, aim);
      const collar = armCollar(arm);
      // Fed: in front of the mouth, nearer the player than the slot, its whole face showing.
      const fed = fedSpot(arm, machine.tips[arm], machine.rolling[0].remaining);
      expect(fed.depth).toBe(collar.depth + SLOT.out);
      const shown = stampAt(frame(machine).stamps, fed.x, fed.height, fed.depth);
      expect(shown.off).toBeLessThan(1e-6);
      const full = MEDAL_RADIUS * project(fed.x, fed.height, fed.depth).scale;
      expect(shown.stamp.width).toBeGreaterThan(full * 0.99);
      // The camera looks down on it from the middle, so it is not quite a circle: two thirds of one, which is more of itself than a medal on the rail or on the table shows.
      const area = Math.abs(shown.stamp.across[0] * shown.stamp.down[1] - shown.stamp.across[1] * shown.stamp.down[0]);
      expect(area / (full * full)).toBeGreaterThan(0.65);
      // Larger than a medal lying at the very front of the table.
      expect(full).toBeGreaterThan(MEDAL_RADIUS * project(FIELD.width / 2, 0, FIELD.depth).scale * 1.2);
      // Taken in: the slot is drawn over where it is, and the medal itself is not drawn until it comes out on the rail.
      step(machine, FEED.slot - 1 / 60);
      const inside = fedSpot(arm, machine.tips[arm], machine.rolling[0].remaining);
      expect(inside.leg).toBe('slot');
      expect(stampAt(frame(machine).stamps, inside.x, inside.height, inside.depth).off).toBeGreaterThan(5);
    }
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
      // Both are at the tip, to a fraction of a pixel, and drawn between the same two lines: as round as each other, leaning and turned the same way.
      expect(last.off).toBeLessThan(0.2);
      expect(first.off).toBeLessThan(0.2);
      for (const line of ['across', 'down'] as const) {
        expect(Math.abs(first.stamp[line][0] - last.stamp[line][0])).toBeLessThan(0.15);
        expect(Math.abs(first.stamp[line][1] - last.stamp[line][1])).toBeLessThan(0.15);
      }
    }
  });

  it('draws an arm in the middle of its swing where the machine has it, medal and all, and the same with reduced motion', () => {
    fakeDocument();
    const machine = createMachine(3);
    point(machine, 12);
    // A medal goes into the left arm, and the aim jumps across the field: the arm sets off after it.
    dropMedal(machine, 12);
    step(machine, FEED.slot + 0.2);
    aimArms(machine, 90);
    step(machine, 4 / 60);
    const [left, right] = machine.tips;
    expect(left).toBeCloseTo(12 + (4 * ARMS.speed) / 60, 9);
    expect(left).toBeLessThan(ARM_REACH[0].max - 20);
    expect(right).toBeGreaterThan(armRest(1));
    expect(right).toBeLessThan(90);
    const spot = rollingSpot(0, left, machine.rolling[0].remaining);
    const pictures = [false, true].map((calm) => {
      const { lines, starts, stamps } = frame(machine, false, calm);
      // Each rail ends at its tip as it is now, and the medal is on the rail as it is now: neither where it set off nor where it is going.
      expect(endsAt([...starts, ...lines], 0, left)).toBe(true);
      expect(endsAt([...starts, ...lines], 1, right)).toBe(true);
      expect(stampAt(stamps, spot.x, spot.height, spot.depth).off).toBeLessThan(1e-6);
      for (const tipX of [12, ARM_REACH[0].max]) {
        expect(endsAt([...starts, ...lines], 0, tipX)).toBe(false);
        const elsewhere = rollingSpot(0, tipX, machine.rolling[0].remaining);
        expect(stampAt(stamps, elsewhere.x, elsewhere.height, elsewhere.depth).off).toBeGreaterThan(1);
      }
      const end = onRail(0, left, railFrame(0, left).length + 0.6);
      return lines.filter((line) => Math.hypot(line.x - end.x, line.y - end.y) < 30);
    });
    // The arms are part of the machine, like the gates: with reduced motion the rail is drawn in the very same place.
    expect(pictures[0].length).toBeGreaterThan(0);
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
    // In this frame the end of the rail and the medal that has just left it are drawn in one place.
    const { lines, starts, stamps } = frame(machine);
    const tip = armTip(0, machine.tips[0]);
    expect(letGo(medal)).toEqual(tip);
    expect(stampAt(stamps, tip.x, tip.height, tip.depth).off).toBeLessThan(1e-6);
    expect(endsAt([...starts, ...lines], 0, medal.fromX)).toBe(true);
    // Nothing is in the air at the end of the arm's reach, where the aim alone would have put it.
    const reach = armTip(0, 90);
    expect(reach.x).toBe(ARM_REACH[0].max);
    expect(stampAt(stamps, reach.x, reach.height, reach.depth).off).toBeGreaterThan(40);
    expect(endsAt([...starts, ...lines], 0, reach.x)).toBe(false);
  });

  it('keeps an arm over the aim past the middle while a medal is on its rail, and draws the medal on it there', () => {
    fakeDocument();
    const machine = createMachine(3);
    dropMedal(machine, 45);
    step(machine, FEED.slot + 0.3);
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
    // It hangs from the foot of a medal at the tip, out over the pusher where the tip is.
    const apex = project(40, ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    expect(near(frame(machine, true).starts, apex.x, apex.y)).toBe(true);
    expect(near(frame(machine, false).starts, apex.x, apex.y)).toBe(false);
    // It hangs under the tip of the arm that takes the next medal, so while that arm is still on its way to an aim
    // that has jumped, it is where a medal leaving now would be let go, not where the aim is.
    aimArms(machine, 85);
    step(machine, 1 / 60);
    const [, right] = machine.tips;
    expect(right).toBeLessThan(85);
    const swinging = project(right, ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const there = project(85, ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const { starts } = frame(machine, true);
    expect(near(starts, swinging.x, swinging.y)).toBe(true);
    expect(near(starts, there.x, there.y)).toBe(false);
  });
});
