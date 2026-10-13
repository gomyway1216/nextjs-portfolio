import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, SLOT, armCollar, armStart, armTip, fedSpot, legOf, letGo, railFrame, rollingSpot, slotSpot } from '@/components/game/MedalPusher/arms';
import { APRON, CATCHER, apronSpot, caught, mouthOnDrawing, mouthSpots, underCatcher } from '@/components/game/MedalPusher/catcher';
import { CHUCKERS } from '@/components/game/MedalPusher/chuckers';
import {
  AIM,
  ARM_REACH,
  CHECKERS,
  FALL_TIME,
  FIELD,
  MEDAL_RADIUS,
  FEED,
  PUSHER,
  ROLL_TIME,
  createMachine,
  dropJewel,
  pusherFront,
  step,
  type Arm,
  type Machine,
  type Medal,
} from '@/components/game/MedalPusher/engine';
import {
  JEWEL_CUT,
  JEWEL_FACETS,
  JEWEL_GIRDLE,
  JEWEL_LAMPS,
  JEWEL_PLATE,
  JEWEL_SHOW,
  LAMP_OUTLINE,
  collectedJewel,
  fallingJewel,
  jewelLampX,
  lyingJewel,
  pointInCabinet,
  type JewelSpot,
} from '@/components/game/MedalPusher/jewel';
import {
  APRON_CAP,
  BALL_RADIUS,
  EXIT_TIME,
  GLOW_TIME,
  GOLD_FLASH,
  ageStage,
  celebrate,
  createStage,
  drawField,
  goldFlash,
  lightGate,
  showJewel,
  trackMedals,
  type ExitingMedal,
  type Stage,
} from '@/components/game/MedalPusher/render';
import { CHUTE, HEIGHT, HOLD_LAMPS, HOUSING, SCREEN, VIEW, chuteHeight, project } from '@/components/game/MedalPusher/view';

import { aimBoth, aimSide, dropAt } from './feeding';

/**
 * A medal's face, or a ball, as it was stamped on the canvas: where its middle is, how wide and how tall it was
 * drawn, how far it was turned, the two lines across its face that the canvas was told to draw it between, how
 * much of it shows through, which picture it is, and whether the canvas was drawing only inside some outline.
 */
interface Stamp {
  x: number;
  y: number;
  width: number;
  height: number;
  turn: number;
  across: [number, number];
  down: [number, number];
  alpha: number;
  image: unknown;
  clipped: boolean;
}

/** A stretch of an ellipse as it was drawn: its middle, how far it reaches across and down, and from what angle to what. */
interface Arc {
  x: number;
  y: number;
  across: number;
  down: number;
  from: number;
  to: number;
}

/**
 * A stand-in for a canvas's 2D context. It draws nothing and remembers what
 * the tests look for: every piece of text, at the pixel it was drawn, how
 * large and in what colour; every point a path was started from or carried
 * on to; every stretch of an ellipse; every rectangle filled, by where it was
 * asked for and in what colour; every image stamped; and the order the words
 * and the images came in, each image by its place among the stamps. It keeps the transform as a canvas does, through
 * `save` and `restore` too.
 */
function recorder() {
  const arcs: Arc[] = [];
  const texts: { text: string; x: number; y: number; wide: number; tall: number; style: string }[] = [];
  const starts: { x: number; y: number }[] = [];
  const lines: { x: number; y: number }[] = [];
  const stamps: Stamp[] = [];
  const rects: { at: [number, number]; style: string }[] = [];
  const log: string[] = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let alpha = 1;
  let style = '';
  let clipped = false;
  const saved: { matrix: number[]; alpha: number; clipped: boolean }[] = [];
  const at = (x: number, y: number) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  const gradient = { addColorStop: () => undefined };
  const own: Record<string, unknown> = {
    setTransform: (...values: number[]) => {
      matrix = values;
    },
    translate: (x: number, y: number) => {
      const moved = at(x, y);
      matrix = [matrix[0], matrix[1], matrix[2], matrix[3], moved.x, moved.y];
    },
    scale: (x: number, y: number) => {
      matrix = [matrix[0] * x, matrix[1] * x, matrix[2] * y, matrix[3] * y, matrix[4], matrix[5]];
    },
    save: () => {
      saved.push({ matrix, alpha, clipped });
    },
    restore: () => {
      const last = saved.pop();
      if (last) ({ matrix, alpha, clipped } = last);
    },
    clip: () => {
      clipped = true;
    },
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, ...at(x, y), wide: Math.hypot(matrix[0], matrix[1]), tall: Math.hypot(matrix[2], matrix[3]), style });
      log.push(`text:${text}`);
    },
    fillRect: (x: number, y: number) => {
      rects.push({ at: [x, y], style });
    },
    moveTo: (x: number, y: number) => {
      starts.push(at(x, y));
    },
    lineTo: (x: number, y: number) => {
      lines.push(at(x, y));
    },
    ellipse: (x: number, y: number, rx: number, ry: number, _turn: number, from: number, to: number) => {
      arcs.push({ ...at(x, y), across: rx * matrix[0], down: ry * matrix[3], from, to });
    },
    drawImage: (image: unknown) => {
      // A sprite is stamped on a square of two units about the origin: the transform says the rest.
      const [a, b, c, d, x, y] = matrix;
      log.push(`image:${stamps.length}`);
      stamps.push({ x, y, width: Math.hypot(a, c), height: Math.hypot(b, d), turn: Math.atan2(-c, a), across: [a, b], down: [c, d], alpha, image, clipped });
    },
  };
  // Everything else a context can do is accepted and ignored; the calls that return something return a gradient.
  const context = new Proxy(own, {
    get: (target, name: string) => target[name] ?? (() => gradient),
    set: (_target, name: string, value: unknown) => {
      if (name === 'globalAlpha' && typeof value === 'number') alpha = value;
      if (name === 'fillStyle') style = typeof value === 'string' ? value : '';
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, texts, starts, lines, stamps, arcs, rects, log };
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

describe('the catcher on the canvas', () => {
  /** One frame of the field at `time`, and what it drew. */
  const frame = (time: number, calm: boolean) => {
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = time;
    const screen = recorder();
    drawField(screen.context, stage, machine, { showGuide: true, calm });
    return screen;
  };
  /** Moments all through the pusher's stroke: out, back, and on the way. */
  const TIMES = [0, 0.75, 1.5, 2.2, 4.5, 5.3];
  const P = HEIGHT.pusher;
  const near = (points: { x: number; y: number }[], x: number, y: number, within = 1e-6) => points.some((point) => Math.hypot(point.x - x, point.y - y) < within);
  const seen = (spot: { x: number; height: number; depth: number }) => project(spot.x, spot.height, spot.depth);
  /** How many pixels of a phone's screen a pixel of the drawing is, when the stage is as wide as it is on a 375-pixel page. */
  const PHONE = 345 / VIEW.width;

  it('paints nothing of the catcher into the layer that is drawn once: it rides with the pusher', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => canvas.texts.map((entry) => entry.text));
    // The words on the table and under the screen are there, so the layer was recorded; the catcher's are not.
    expect(once.filter((text) => text === 'GET')).toHaveLength(3);
    expect(once.filter((text) => text === 'OUT')).toHaveLength(2);
    expect(once.filter((text) => text === 'HOLD')).toHaveLength(1);
    expect(once).not.toContain('START');
  });

  it('writes START under every mouth, on the apron, tall enough to read on a phone, wherever the stroke has taken it', () => {
    fakeDocument();
    const heights = new Set<number>();
    for (const time of TIMES) {
      const words = frame(time, false).texts.filter((entry) => entry.text === 'START');
      expect(words).toHaveLength(CHUCKERS.count);
      words.forEach((word, pocket) => {
        // The foot of its letters: half the capitals' height below the middle of the apron, straight under the mouth.
        const foot = seen(apronSpot(CATCHER.tile * (pocket + 0.5), APRON / 2 + APRON_CAP / 2, time));
        expect(Math.hypot(word.x - foot.x, word.y - foot.y)).toBeLessThan(1.5);
        // The apron is nearer the player than the deck, so a word under an outer mouth is a pixel or two further out than the mouth is.
        expect(Math.abs(word.x - mouthOnDrawing(pocket, time).x)).toBeLessThan(2.5);
        // Between the rail and the foot of the apron, which is above the medals on the lower table.
        expect(word.y).toBeGreaterThan(seen(apronSpot(0, 0, time)).y);
        expect(word.y).toBeLessThan(seen(apronSpot(0, APRON, time)).y);
        // Its capitals, as the canvas was told to draw them: a canvas that cannot measure is taken to draw them 7.16 tall at the size asked for.
        expect(7.16 * word.tall * PHONE).toBeGreaterThanOrEqual(11);
        // And the word is no wider than its pocket's stretch of the apron.
        expect(36.7 * word.wide).toBeLessThan(CATCHER.tile * (seen(apronSpot(1, 0, time)).x - seen(apronSpot(0, 0, time)).x));
        heights.add(Math.round(word.y));
      });
    }
    // It rides out and back with the pusher: lower on the drawing the further out the lip is.
    expect(heights.size).toBeGreaterThan(3);
    expect(frame(PUSHER.period / 2, false).texts.find((entry) => entry.text === 'START')?.y).toBeGreaterThan((frame(0, false).texts.find((entry) => entry.text === 'START')?.y ?? 0) + 30);
  });

  it('draws every mouth as a hole out in front of the lip: an oval as wide as its pocket, a rim round it, and a floor down inside it', () => {
    fakeDocument();
    for (const time of TIMES) {
      const { arcs } = frame(time, false);
      mouthSpots(time).forEach((spot, pocket) => {
        const top = project(spot.x, spot.height + CATCHER.rim.high, spot.depth);
        const own = arcs.filter((arc) => Math.hypot(arc.x - top.x, arc.y - top.y) < 1e-6);
        const whole = own.filter((arc) => arc.from === 0 && arc.to === Math.PI * 2);
        // The mouth itself, as wide inside as a medal that just fits, and the rim round it, which is a good deal wider.
        expect(whole.some((arc) => Math.abs(arc.across - CHUCKERS.radius * top.scale) < 1e-6)).toBe(true);
        expect(Math.max(...own.map((arc) => arc.across))).toBeCloseTo((CHUCKERS.radius + CATCHER.rim.wide) * top.scale, 6);
        expect(CHUCKERS.radius).toBeCloseTo(MEDAL_RADIUS + CHECKERS.halfWidth, 12);
        // Each is seen from above like anything lying level there.
        for (const arc of own) expect(arc.down / arc.across).toBeCloseTo(top.tilt, 6);
        // The near half of the rim is drawn again, last, over whatever is in the mouth.
        expect(own.filter((arc) => arc.from === 0 && arc.to === Math.PI).length).toBeGreaterThanOrEqual(1);
        // It is where the catcher says the mouth is on the drawing, beyond the lip, and it is big enough to see on a phone.
        const mouth = mouthOnDrawing(pocket, time);
        expect(top.x).toBeCloseTo(mouth.x, 9);
        expect(top.y).toBeCloseTo(mouth.y, 9);
        expect(top.y - (mouth.tall / 2) * 1.01).toBeGreaterThan(project(spot.x, P, pusherFront(time)).y);
        expect(mouth.wide * PHONE).toBeGreaterThan(23);
        // Down inside it, the floor of the throat: a smaller oval, lower on the drawing, which is what gives the hole its depth.
        const floor = project(spot.x, CATCHER.throat, spot.depth);
        const below = arcs.filter((arc) => Math.hypot(arc.x - floor.x, arc.y - floor.y) < 1e-6);
        expect(below).toHaveLength(1);
        expect(below[0].across).toBeLessThan(CHUCKERS.radius * top.scale);
        expect(floor.y).toBeGreaterThan(top.y + mouth.tall / 4);
      });
    }
  });

  it('is one piece: a deck from the lip to its rail and an apron from the rail to its foot, as long as the three pockets take', () => {
    fakeDocument();
    for (const time of TIMES) {
      const front = pusherFront(time);
      const { starts, lines } = frame(time, false);
      for (const [x, height, depth] of [
        // The deck: from the lip out to the back of the rail.
        [CATCHER.from, CATCHER.deck, front],
        [CATCHER.to, CATCHER.deck, front],
        [CATCHER.to, CATCHER.deck, front + CATCHER.rail.out - CATCHER.rail.thick],
        // The rail, and the apron from it down to its foot.
        [CATCHER.from, CATCHER.rail.top, front + CATCHER.rail.out],
        [CATCHER.to, CATCHER.rail.top, front + CATCHER.rail.out],
        [CATCHER.to, CATCHER.foot.height, front + CATCHER.foot.out],
        [CATCHER.from, CATCHER.foot.height, front + CATCHER.foot.out],
      ]) {
        const corner = project(x, height, depth);
        expect(near([...starts, ...lines], corner.x, corner.y)).toBe(true);
      }
      // Nothing of the old panel is on the pusher's top: no plate behind the lip.
      const behind = project(CATCHER.from, P, front - 7.4);
      expect(near([...starts, ...lines], behind.x, behind.y)).toBe(false);
    }
  });

  it('draws the catcher in the same place with reduced motion: it is part of the machine', () => {
    fakeDocument();
    for (const time of TIMES) {
      const moving = frame(time, false);
      const calm = frame(time, true);
      expect(calm.texts.filter((entry) => entry.text === 'START')).toEqual(moving.texts.filter((entry) => entry.text === 'START'));
      expect(calm.arcs).toEqual(moving.arcs);
    }
  });

  it('lights the pocket of the number it is told, and no other: its stretch of the apron, and its word', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    /** The stretches of the apron that were filled over with light, by where each begins along it. */
    const litFrom = (screen: Recorder) => screen.rects.filter((rect) => rect.style.startsWith('rgba(255, 244, 150')).map((rect) => rect.at[0]);
    const words = (screen: Recorder) => screen.texts.filter((entry) => entry.text === 'START').map((entry) => entry.style);
    const dark = recorder();
    drawField(dark.context, stage, machine, { showGuide: false });
    expect(litFrom(dark)).toEqual([]);
    expect(new Set(words(dark)).size).toBe(1);
    lightGate(stage, 2);
    expect(stage.gateGlow).toEqual([0, 0, expect.any(Number)]);
    expect(stage.gateGlow[2]).toBeGreaterThan(0);
    lightGate(stage, 7);
    expect(stage.gateGlow).toHaveLength(CHUCKERS.count);
    const screen = recorder();
    expect(() => drawField(screen.context, stage, machine, { showGuide: false })).not.toThrow();
    expect(litFrom(screen)).toEqual([CATCHER.tile * 2]);
    const colours = words(screen);
    expect(colours).toHaveLength(3);
    expect(colours[0]).toBe(colours[1]);
    expect(colours[2]).not.toBe(colours[0]);
  });

  it('draws a medal on its way down a pocket inside the mouth, lower and darker as it goes, and not among the medals on the table', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    const x = CHECKERS.positions[0] + 1;
    const through = (sinceDrop: number): Medal => ({ id: 901, x, y: front + MEDAL_RADIUS, level: 0, tier: 0, sinceDrop, stack: 1, grow: 0, ball: false, grown: 1 });
    /** One frame with only that medal on the field: what was drawn, and the pictures of medals among it. */
    const drawn = (medal: Medal) => {
      machine.medals = [medal];
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false });
      return { ...screen, stamps: screen.stamps.filter((stamp) => stamp.image === stage.medal) };
    };
    let last: { x: number; y: number; alpha: number } = { x: 0, y: -Infinity, alpha: 2 };
    for (const sinceDrop of [0.02, 0.12, 0.2, 0.3]) {
      const medal = through(sinceDrop);
      const held = caught(medal, machine.time);
      if (!held) throw new Error('not caught');
      const { stamps } = drawn(medal);
      // One picture of it, with its face where the catcher has it, and nothing where the engine has it lying.
      expect(stamps).toHaveLength(1);
      const face = project(held.x, held.height + HEIGHT.medal / 2, held.depth);
      expect(stamps[0].x).toBeCloseTo(face.x, 6);
      expect(stamps[0].y).toBeCloseTo(face.y, 6);
      expect(stamps[0].alpha).toBeCloseTo(held.light, 9);
      expect(stamps[0].y).toBeGreaterThan(last.y);
      expect(stamps[0].alpha).toBeLessThanOrEqual(last.alpha);
      last = stamps[0];
    }
    // It ends in the mouth, on the drawing as in the cabinet.
    const mouth = mouthOnDrawing(0, machine.time);
    expect(Math.abs(last.x - mouth.x)).toBeLessThan(mouth.wide / 2);
    expect(Math.abs(last.y - mouth.y)).toBeLessThan(mouth.tall);
    expect(last.alpha).toBeLessThan(0.5);
    // Once it is down it is a medal on the lower table again, under the catcher, drawn before the catcher is.
    const lying = drawn(through(CATCHER.sink + 0.01));
    expect(lying.stamps).toHaveLength(1);
    expect(lying.stamps[0].alpha).toBe(1);
    const where = project(x, HEIGHT.medal, front + MEDAL_RADIUS);
    expect(lying.stamps[0].x).toBeCloseTo(where.x, 6);
    expect(lying.stamps[0].y).toBeCloseTo(where.y, 6);
  });

  it('draws a medal that came over beside a pocket tipping over the lip and going down behind the catcher, as the 3D picture does', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    // Half way between two pockets: over the lip at the catcher, and through neither.
    const x = (CHECKERS.positions[0] + CHECKERS.positions[1]) / 2;
    const beside = (sinceDrop: number): Medal => ({ id: 902, x, y: front + MEDAL_RADIUS, level: 0, tier: 0, sinceDrop, stack: 1, grow: 0, ball: false, grown: 1 });
    const drawn = (medal: Medal) => {
      machine.medals = [medal];
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false });
      const stamps = screen.stamps.filter((stamp) => stamp.image === stage.medal);
      return { stamps, medalAt: screen.log.indexOf(`image:${screen.stamps.indexOf(stamps[0])}`), catcherAt: screen.log.indexOf('text:START') };
    };
    let last = { y: -Infinity, round: Infinity };
    const rounds: number[] = [];
    for (const sinceDrop of [0.02, 0.07, 0.12, 0.17]) {
      const medal = beside(sinceDrop);
      const held = caught(medal, machine.time);
      if (!held) throw new Error('not held');
      expect(held.chucker).toBe(-1);
      const { stamps, medalAt, catcherAt } = drawn(medal);
      // One picture of it: where the catcher has it, after the catcher and the pusher's top, and cut off at the deck.
      expect(stamps).toHaveLength(1);
      const at = project(held.x, held.height, held.depth);
      expect(stamps[0].x).toBeCloseTo(at.x, 6);
      expect(stamps[0].y).toBeCloseTo(at.y, 6);
      expect(stamps[0].clipped).toBe(true);
      expect(medalAt).toBeGreaterThan(catcherAt);
      // It goes down as it goes.
      const round = stamps[0].height / stamps[0].width;
      expect(stamps[0].y).toBeGreaterThan(last.y);
      rounds.push(round);
      last = { y: stamps[0].y, round };
    }
    // It turns on to its edge quickly and stays there: after the first moment it is much flatter on the drawing than
    // it began, and by the end much flatter than a medal lying there would be.
    for (const round of rounds.slice(1)) expect(round).toBeLessThan(rounds[0] * 0.75);
    expect(last.round).toBeLessThan(project(x, P, front).tilt * 0.5);
    // Once it is down it is a medal on the lower table again, under the catcher, drawn before the catcher is.
    const lying = drawn(beside(CHUCKERS.drop + 0.01));
    expect(lying.stamps).toHaveLength(1);
    expect(lying.stamps[0].clipped).toBe(false);
    expect(lying.medalAt).toBeLessThan(lying.catcherAt);
    const where = project(x, HEIGHT.medal, front + MEDAL_RADIUS);
    expect(lying.stamps[0].x).toBeCloseTo(where.x, 6);
    expect(lying.stamps[0].y).toBeCloseTo(where.y, 6);
  });

  it('draws a ball that lies under the catcher before the catcher, which covers it, and one that has come out from under it after', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    const ball = (y: number, sinceDrop = 1): Medal => ({ id: 902, x: 50, y, level: 0, tier: 0, sinceDrop, stack: 1, grow: 0, ball: true, grown: 1 });
    const order = (medal: Medal) => {
      machine.medals = [medal];
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false });
      const balls = screen.stamps.flatMap((stamp, index) => (stamp.image === stage.ball ? [index] : []));
      expect(balls).toHaveLength(1);
      return { ball: screen.log.indexOf(`image:${balls[0]}`), catcher: screen.log.indexOf('text:START'), clipped: screen.stamps[balls[0]].clipped };
    };
    // At the foot of the pusher's face, under the catcher: it is taller than the catcher, and the catcher is drawn over it.
    expect(BALL_RADIUS * 2).toBeGreaterThan(CATCHER.deck);
    const under = order(ball(front + MEDAL_RADIUS));
    expect(under.ball).toBeLessThan(under.catcher);
    expect(underCatcher(50, front + MEDAL_RADIUS, BALL_RADIUS, machine.time)).toBe(true);
    // Its middle out past the catcher's foot: it stands in front of the apron, and is drawn over it.
    const clear = order(ball(front + CATCHER.foot.out + 1));
    expect(clear.ball).toBeGreaterThan(clear.catcher);
    // Far down the table it is nowhere near the catcher, and is drawn with the other medals as it always was.
    const far = order(ball(front + CATCHER.foot.out + BALL_RADIUS * 2 + 5));
    expect(far.ball).toBeLessThan(far.catcher);
    // One that has only just come over the lip behind the catcher is still going down behind it: drawn last, and only what shows over the deck.
    const going = order(ball(front + MEDAL_RADIUS, 0.05));
    expect(going.ball).toBeGreaterThan(going.catcher);
    expect(going.clipped).toBe(true);
    expect(under.clipped).toBe(false);
  });

  it('draws two balls at the catcher the nearer one last, whichever of them the machine holds first', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    const ball = (id: number, x: number, y: number, sinceDrop = 1): Medal => ({ id, x, y, level: 0, tier: 0, sinceDrop, stack: 1, grow: 0, ball: true, grown: 1 });
    /** How far out from the back wall each ball that was drawn is, in the order they were drawn, and whether each was drawn after the catcher. */
    const drawn = (medals: Medal[]) => {
      machine.medals = medals;
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false });
      const catcher = screen.log.indexOf('text:START');
      const balls = screen.stamps.flatMap((stamp, index) => (stamp.image === stage.ball ? [index] : []));
      return balls.map((index) => {
        // Each is told from the other by which side of the middle it is on.
        const medal = medals.find((one) => one.x < 50 === screen.stamps[index].x < VIEW.width / 2) as Medal;
        return { depth: medal.y, after: screen.log.indexOf(`image:${index}`) > catcher };
      });
    };
    // Two that stand in front of the apron, their middles out past the catcher's foot and the rest of them still under it.
    // The nearer one has the lower id, and comes first in one list and last in the other.
    const standing = [ball(905, 44, front + CATCHER.foot.out + 0.5), ball(904, 56, front + CATCHER.foot.out + 2.5)];
    for (const one of standing) expect(underCatcher(one.x, one.y, BALL_RADIUS * 2, machine.time)).toBe(true);
    // And two that have only just come over the lip behind the catcher, and are still going down behind it.
    const dropping = [ball(907, 44, front + MEDAL_RADIUS, 0.05), ball(906, 56, front + MEDAL_RADIUS + 2, 0.05)];
    for (const pair of [standing, dropping]) {
      const [far, near] = pair;
      expect(near.id).toBeLessThan(far.id);
      for (const medals of [
        [far, near],
        [near, far],
      ]) {
        const order = drawn(medals);
        expect(order.map((one) => one.depth)).toEqual([far.y, near.y]);
        // Both lists are drawn over the catcher, which is why the order the machine holds them in could show.
        expect(order.map((one) => one.after)).toEqual([true, true]);
      }
    }
  });
});

describe('the feed arms on the canvas', () => {
  const near = (points: { x: number; y: number }[], x: number, y: number, within = 1e-6) => points.some((point) => Math.hypot(point.x - x, point.y - y) < within);
  /** One frame of the machine as it stands, and what it drew. The arms are drawn from the machine: the stage keeps nothing of them. */
  const frame = (machine: Machine, showGuide = false, calm = false) => {
    const stage = createStage(1);
    const screen = recorder();
    drawField(screen.context, stage, machine, { showGuide, calm });
    return screen;
  };
  /** Points the arms and gives them time to get there. Nothing else moves: the machine has not been fed. */
  const point = (machine: Machine, aim: number): void => {
    aimSide(machine, aim);
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
    expect(machine.tips).toEqual([12, armStart(1)]);
    const { lines, starts } = frame(machine);
    const drawn = [...starts, ...lines];
    // The left one ends over its aim, the right one where a new machine has it pointed; each begins at its own collar.
    expect(endsAt(drawn, 0, 12)).toBe(true);
    expect(endsAt(drawn, 1, armStart(1))).toBe(true);
    expect(startsAt(drawn, 0, 12)).toBe(true);
    expect(startsAt(drawn, 1, armStart(1))).toBe(true);
    // And nothing is drawn where the left arm was before it was pointed.
    expect(endsAt(drawn, 0, armStart(0))).toBe(false);
    // The near end is by the player: low on the drawing and at its side. The far end is over the pusher, further up and nearer the middle.
    const from = onRail(0, 12, 3);
    const to = onRail(0, armStart(0), railFrame(0, armStart(0)).length);
    expect(from.y).toBeGreaterThan(to.y + 200);
    expect(from.x).toBeLessThan(to.x - 100);
  });

  it('paints nothing of the arms into the layer that is drawn once: they move', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => [...canvas.starts, ...canvas.lines]);
    expect(once.length).toBeGreaterThan(0);
    for (const arm of [0, 1] as const) {
      for (const tipX of [armStart(arm), FIELD.width / 2]) {
        expect(endsAt(once, arm, tipX)).toBe(false);
        expect(startsAt(once, arm, tipX)).toBe(false);
      }
    }
    expect(armCollar(0).height).toBeGreaterThan(ARMS.tip);
  });

  it('draws each arm where the machine has its tip, wherever it is pointed', () => {
    fakeDocument();
    for (const aim of [AIM.min, 20, 49, 50, 63, AIM.max]) {
      const machine = createMachine(3);
      point(machine, aim);
      expect(machine.tips).toEqual(aim < FIELD.width / 2 ? [aim, armStart(1)] : [armStart(0), aim]);
      const { lines, starts } = frame(machine);
      for (const arm of [0, 1] as const) expect(endsAt([...starts, ...lines], arm, machine.tips[arm])).toBe(true);
    }
  });

  it('draws a medal on a rail where it has rolled to, on its edge and leaning back, its face turned to the middle', () => {
    fakeDocument();
    for (const [aim, arm] of [[30, 0], [70, 1]] as const) {
      const machine = createMachine(3);
      dropAt(machine, aim);
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
      dropAt(machine, aim);
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
      dropAt(machine, 40);
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
      dropAt(machine, aim);
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
      expect(shown.stamp.clipped).toBe(false);
      // Taken in: it has turned edge on to go in at the mouth, so much less of its face shows, and it is inside the
      // funnel, whose near side is in front of the foot of it.
      step(machine, FEED.slot - 1 / 60);
      const inside = fedSpot(arm, machine.tips[arm], machine.rolling[0].remaining);
      expect(inside.leg).toBe('slot');
      const taken = stampAt(frame(machine).stamps, inside.x, inside.height, inside.depth);
      expect(taken.off).toBeLessThan(1e-6);
      expect(Math.abs(taken.stamp.across[0] * taken.stamp.down[1] - taken.stamp.across[1] * taken.stamp.down[0])).toBeLessThan(area * 0.7);
      expect(taken.stamp.clipped).toBe(true);
      expect(inside.depth).toBeLessThan(slotSpot(arm, 0, -SLOT.ring * SLOT.throat, SLOT.face).depth);
    }
  });

  it('draws each slot as a funnel with a mouth a medal plainly fits: as tall as a medal, and several times as wide as one is thick', () => {
    fakeDocument();
    const PHONE = 345 / VIEW.width;
    const { arcs } = frame(createMachine(3));
    for (const arm of [0, 1] as const) {
      const middle = slotSpot(arm, 0, 0, SLOT.face - SLOT.deep);
      const at = project(middle.x, middle.height, middle.depth);
      // The mouth is drawn on its own plane, set back inside the ring: its bright edge, and the dark inside that.
      const own = arcs.filter((arc) => Math.hypot(arc.x - at.x, arc.y - at.y) < 1e-6);
      expect(own).toHaveLength(2);
      const [wide, tall] = [Math.min(...own.map((arc) => Math.abs(arc.across))) * 2, Math.min(...own.map((arc) => Math.abs(arc.down))) * 2];
      const across = slotSpot(arm, 1, 0, SLOT.face - SLOT.deep);
      const up = slotSpot(arm, 0, 1, SLOT.face - SLOT.deep);
      expect(wide).toBeCloseTo(SLOT.mouth.wide * (project(across.x, across.height, across.depth).x - at.x), 6);
      expect(tall).toBeCloseTo(SLOT.mouth.tall * (at.y - project(up.x, up.height, up.depth).y), 6);
      // A medal standing on its edge goes in with room to spare, on the drawing as in the cabinet.
      expect(SLOT.mouth.tall).toBeGreaterThan(MEDAL_RADIUS * 2);
      expect(SLOT.mouth.wide).toBeGreaterThan(HEIGHT.medal * 3);
      expect(SLOT.mouth.wide).toBeLessThan(MEDAL_RADIUS * 2);
      expect(tall).toBeGreaterThan(MEDAL_RADIUS * 2 * at.scale * 0.9);
      // On a phone the mouth is a dozen pixels wide and two dozen tall; before, it was a slit of five.
      expect(wide * PHONE).toBeGreaterThan(12);
      expect(tall * PHONE).toBeGreaterThan(22);
      // The ring round it is all on the drawing, and stays above the open side of the lower table, which begins where the wall ends.
      const ring = [slotSpot(arm, -SLOT.ring, 0, SLOT.face), slotSpot(arm, SLOT.ring, 0, SLOT.face), slotSpot(arm, 0, -SLOT.ring, SLOT.face)].map((spot) => project(spot.x, spot.height, spot.depth));
      expect(Math.min(ring[0].x, ring[1].x)).toBeGreaterThanOrEqual(0);
      expect(Math.max(ring[0].x, ring[1].x)).toBeLessThanOrEqual(VIEW.width);
      expect(ring[2].y).toBeLessThan(project(arm === 0 ? 0 : FIELD.width, 0, FIELD.sideOpenFrom).y);
      expect((ring[1].x - ring[0].x) * PHONE).toBeGreaterThan(38);
      // The throat inside the ring of light is wide enough to take the whole mouth in.
      expect(SLOT.ring * SLOT.throat).toBeGreaterThan(SLOT.mouth.tall / 2 + 0.3);
      expect(SLOT.light).toBeGreaterThan(SLOT.throat);
      expect(SLOT.light).toBeLessThan(1);
    }
  });

  it('draws beside each open side a chute with arrows on it that point the way out', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => [...canvas.starts, ...canvas.lines]);
    for (const side of [-1, 1]) {
      const edge = side < 0 ? 0 : FIELD.width;
      // The chute starts under the table's edge where the wall ends, and falls away outward.
      const top = project(edge, chuteHeight(0), FIELD.sideOpenFrom);
      expect(near(once, top.x, top.y)).toBe(true);
      expect(chuteHeight(0)).toBeLessThan(0);
      expect(chuteHeight(5)).toBeLessThan(chuteHeight(0));
      for (const mark of CHUTE.marks) {
        // An arrow: its point further out than its barbs, half way between them, all of it beside the open stretch of the table.
        const point = project(edge + side * CHUTE.far, chuteHeight(CHUTE.far), mark);
        const barbs = [-1, 1].map((end) => project(edge + side * CHUTE.near, chuteHeight(CHUTE.near), mark + (end * CHUTE.span) / 2));
        expect(near(once, point.x, point.y)).toBe(true);
        for (const barb of barbs) expect(near(once, barb.x, barb.y)).toBe(true);
        expect((point.x - barbs[0].x) * side).toBeGreaterThan(10);
        expect(mark - CHUTE.span / 2).toBeGreaterThan(FIELD.sideOpenFrom);
        expect(mark + CHUTE.span / 2).toBeLessThan(FIELD.depth);
        // And it is on the drawing, where it can be seen.
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(VIEW.width);
        expect(point.y).toBeLessThan(VIEW.height);
      }
    }
    expect(CHUTE.marks).toHaveLength(3);
  });

  it('lets a medal go without a jump: its last frame on the rail and its first in the air are the same picture', () => {
    fakeDocument();
    for (const aim of [25, 50, 75]) {
      const machine = createMachine(3);
      dropAt(machine, aim);
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
    dropAt(machine, 12);
    step(machine, FEED.slot + 0.2);
    aimBoth(machine, 90);
    step(machine, 4 / 60);
    const [left, right] = machine.tips;
    expect(left).toBeCloseTo(12 + (4 * ARMS.speed) / 60, 9);
    expect(left).toBeLessThan(ARM_REACH[0].max - 20);
    expect(right).toBeGreaterThan(armStart(1));
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
    // The arms are part of the machine, like the catcher: with reduced motion the rail is drawn in the very same place.
    expect(pictures[0].length).toBeGreaterThan(0);
    expect(pictures[1]).toEqual(pictures[0]);
  });

  it('lets a medal go from the tip as it is drawn when the aim jumps just as it gets there', () => {
    fakeDocument();
    const machine = createMachine(3);
    machine.rng = () => 0.5;
    point(machine, 10);
    dropAt(machine, 10);
    step(machine, ROLL_TIME - 1 / 60);
    expect(machine.tips[0]).toBe(10);
    // The aim jumps to the far side in the very step the medal reaches the end of its rail.
    aimBoth(machine, 90);
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
    dropAt(machine, 45);
    step(machine, FEED.slot + 0.3);
    aimBoth(machine, 58);
    step(machine, 0.1);
    expect(machine.tips).toEqual([58, 58]);
    const spot = rollingSpot(0, 58, machine.rolling[0].remaining);
    expect(stampAt(frame(machine).stamps, spot.x, spot.height, spot.depth).off).toBeLessThan(1e-6);
  });

  it('shows under each arm’s tip how far from it a medal can land, when it is asked to', () => {
    fakeDocument();
    const machine = createMachine(3);
    point(machine, 40);
    // A guide hangs from the foot of a medal at each tip, out over the pusher where the tip is: one for the left
    // arm, which has been pointed, and one for the right, which is where a new machine has it.
    const apex = project(40, ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const other = project(armStart(1), ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const shown = frame(machine, true).starts;
    expect(near(shown, apex.x, apex.y)).toBe(true);
    expect(near(shown, other.x, other.y)).toBe(true);
    const hidden = frame(machine, false).starts;
    expect(near(hidden, apex.x, apex.y)).toBe(false);
    expect(near(hidden, other.x, other.y)).toBe(false);
    // Each hangs under its own arm's tip, so while an arm is still on its way to an aim that has jumped, its guide
    // is where a medal leaving it now would be let go, not where the aim is. The other arm's guide has not moved.
    aimSide(machine, 85);
    step(machine, 1 / 60);
    const [left, right] = machine.tips;
    expect(left).toBe(40);
    expect(right).toBeLessThan(85);
    const swinging = project(right, ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const there = project(85, ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const { starts } = frame(machine, true);
    expect(near(starts, swinging.x, swinging.y)).toBe(true);
    expect(near(starts, there.x, there.y)).toBe(false);
    expect(near(starts, apex.x, apex.y)).toBe(true);
  });
});

describe('the gold spins’ lamps on the canvas', () => {
  /** A stand-in context that remembers every circle drawn: where its middle is and how big it is, on the drawing. */
  const circles = () => {
    const drawn: { x: number; y: number; r: number }[] = [];
    let matrix = [1, 0, 0, 1, 0, 0];
    const gradient = { addColorStop: () => undefined };
    const own: Record<string, unknown> = {
      setTransform: (...values: number[]) => {
        matrix = values;
      },
      arc: (x: number, y: number, r: number) => {
        drawn.push({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5], r: r * Math.hypot(matrix[0], matrix[1]) });
      },
    };
    const context = new Proxy(own, { get: (target, name: string) => target[name] ?? (() => gradient), set: () => true }) as unknown as CanvasRenderingContext2D;
    return { context, drawn };
  };
  /**
   * How bright one lamp of the hold is drawn, from 0 to 1, in a frame of this stage: read back from the halo round
   * it, which is 2.2 times the lamp across when it does not flash and 3.6 times at the top of a flash.
   */
  const flashOf = (stage: ReturnType<typeof createStage>, machine: Machine, lamp: number, calm: boolean): number => {
    const { context, drawn } = circles();
    drawField(context, stage, machine, { showGuide: false, calm, stock: 8, gold: 3 });
    const at = project(HOLD_LAMPS.first + HOLD_LAMPS.step * lamp, (HOUSING.shelf + SCREEN.foot) / 2, HOUSING.ledge);
    // A celebration shakes the picture sideways by a few pixels; the lamps are much further apart than that.
    const own = drawn.filter((circle) => Math.abs(circle.y - at.y) < 1e-6 && Math.abs(circle.x - at.x) < (HOLD_LAMPS.step * at.scale) / 2);
    const body = HOLD_LAMPS.radius * at.scale;
    const halo = Math.max(...own.map((circle) => circle.r));
    expect(own.some((circle) => Math.abs(circle.r - body) < 1e-6)).toBe(true);
    return (halo / body - 2.2) / 1.4;
  };
  const risings = (seen: number[]) => seen.filter((bright, frame) => frame > 0 && seen[frame - 1] < 0.5 && bright >= 0.5).length;

  it('flash at the cabinet’s one rate by the stage’s own clock, in a fever and a jackpot as at any other time', () => {
    fakeDocument();
    const machine = createMachine(3);
    for (const party of [null, 'fever', 'jackpot'] as const) {
      const stage = createStage(1);
      if (party) celebrate(stage, party);
      for (const lamp of [0, 2]) {
        const seen: number[] = [];
        for (let frame = 0; frame <= 120; frame++) {
          stage.clock = 3 + frame / 120;
          const flash = flashOf(stage, machine, lamp, false);
          expect(flash).toBeCloseTo(goldFlash(stage.clock, lamp, false), 6);
          seen.push(flash);
        }
        // In one second it comes up bright as many times as the rate says: twice, and not the dozen and more that the hurried lights of a celebration would make of it.
        expect(risings(seen)).toBe(GOLD_FLASH.perSecond);
      }
    }
  });

  it('do not flash at all with motion reduced, and a held spin that is not gold never does', () => {
    fakeDocument();
    const machine = createMachine(3);
    const stage = createStage(1);
    for (const clock of [3, 3.1, 3.25, 3.4, 9.99]) {
      stage.clock = clock;
      // The three gold ones are steadily at their brightest.
      for (const lamp of [0, 1, 2]) expect(flashOf(stage, machine, lamp, true)).toBeCloseTo(1, 6);
      // The five that are only held have their one steady halo, with motion or without.
      for (const lamp of [3, 7]) {
        expect(flashOf(stage, machine, lamp, false)).toBeCloseTo(0, 6);
        expect(flashOf(stage, machine, lamp, true)).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('the jewels on the canvas', () => {
  const D = FIELD.depth;
  const jewel = (id: number, x: number, y: number, level: 0 | 1, more: Partial<Medal> = {}): Medal => ({ id, x, y, level, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1, jewel: true, ...more });
  const plain = (id: number, x: number, y: number): Medal => ({ id, x, y, level: 0, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1 });
  /** One frame of a field that holds just these, and what it drew. */
  const frame = (medals: Medal[], options: { calm?: boolean; jewels?: number } = {}, stage: Stage = createStage(1), change: (machine: Machine) => void = () => undefined) => {
    const machine = createMachine(3);
    machine.time = 1.5;
    machine.medals = medals;
    change(machine);
    const screen = recorder();
    drawField(screen.context, stage, machine, { showGuide: false, ...options });
    return { screen, stage, machine };
  };
  const drawnAt = (screen: Recorder) => [...screen.starts, ...screen.lines];
  const near = (points: { x: number; y: number }[], at: { x: number; y: number }, within = 1e-6) => points.some((point) => Math.hypot(point.x - at.x, point.y - at.y) < within);
  const seen = (corner: readonly [number, number, number]) => project(corner[0], corner[1], corner[2]);
  /** Whether a stone held as `spot` was drawn: its girdle traced corner by corner, and its table, which looks up at the player. */
  const stoneDrawn = (screen: Recorder, spot: JewelSpot, table = true): boolean =>
    JEWEL_GIRDLE.every((corner) => near(drawnAt(screen), seen(pointInCabinet(spot, corner)))) && (!table || JEWEL_FACETS[0].corners.every((corner) => near(drawnAt(screen), seen(pointInCabinet(spot, corner)))));

  it('draws a jewel face by face where it lies on either table, with a shadow beside it, and stamps no medal for it', () => {
    fakeDocument();
    for (const stone of [jewel(7, 40, 70, 0), jewel(8, 62, 22, 1)]) {
      const { screen, stage, machine } = frame([stone, plain(9, 20, 60)], { calm: true });
      const spot = lyingJewel(stone, machine.time);
      expect(stoneDrawn(screen, spot)).toBe(true);
      // The one medal is stamped, and nothing is stamped for the jewel: it is not a medal's face, nor a ball.
      expect(screen.stamps.filter((stamp) => stamp.image === stage.medal)).toHaveLength(1);
      expect(screen.stamps.filter((stamp) => stamp.image === stage.ball)).toHaveLength(0);
      // Its shadow, and the stone's own colour in it: two ovals on what it stands on, within a stone's width of its foot.
      const foot = project(spot.x, spot.height - JEWEL_CUT.pavilion, spot.depth);
      const ovals = screen.arcs.filter((arc) => Math.hypot(arc.x - foot.x, arc.y - foot.y) < JEWEL_CUT.girdle * foot.scale * 1.5 && arc.across > 0);
      expect(ovals.length).toBeGreaterThanOrEqual(2);
      // It is drawn the same with reduced motion or without: only how its faces flash differs.
      expect(stoneDrawn(frame([stone], { calm: false }).screen, spot)).toBe(true);
    }
    // Where no jewel lies nothing of one is drawn.
    const bare = frame([plain(9, 20, 60)], { calm: true });
    expect(stoneDrawn(bare.screen, lyingJewel(jewel(7, 40, 70, 0), 1.5), false)).toBe(false);
  });

  it('draws a jewel large enough to tell from a medal on a phone, and as wide as a medal is', () => {
    const PHONE = 345 / VIEW.width;
    // The stone nearest the player and the one furthest away that a table can hold.
    const wide = (depth: number, height: number) => (project(50 + JEWEL_CUT.girdle, height, depth).x - project(50 - JEWEL_CUT.girdle, height, depth).x) * PHONE;
    expect(wide(D - MEDAL_RADIUS, JEWEL_CUT.pavilion)).toBeGreaterThanOrEqual(13);
    expect(wide(MEDAL_RADIUS, HEIGHT.pusher + JEWEL_CUT.pavilion)).toBeGreaterThanOrEqual(9);
    expect(JEWEL_CUT.girdle * 2).toBeGreaterThan(MEDAL_RADIUS * 2 * 0.9);
  });

  it('draws a jewel on its way from the hatch and over the front, where the stone is', () => {
    fakeDocument();
    // In the air: dropped this instant, half way down, and about to land.
    for (const share of [1, 0.5, 0.02]) {
      const { screen, machine } = frame([], { calm: true }, createStage(1), (m) => {
        dropJewel(m);
        m.falling[0].remaining = m.falling[0].duration * share;
      });
      expect(stoneDrawn(screen, fallingJewel(machine.falling[0]), false)).toBe(true);
    }
    const over: ExitingMedal = { id: 5, x: 30, y: D + 0.2, kind: 'won', side: -1, ball: false, jewel: true, age: 0.1 };
    const stage = createStage(1);
    stage.exits.push(over);
    const { screen } = frame([], { calm: true }, stage);
    expect(stoneDrawn(screen, collectedJewel(5, 30, D + 0.2, 0.1), false)).toBe(true);
    // It is not stamped as a medal or a ball on its way out.
    expect(screen.stamps.filter((stamp) => stamp.image === stage.medal || stamp.image === stage.ball)).toHaveLength(0);
  });

  it('notes a jewel that has left the field, which is always over the front: the tray lit, and a burst of its own colours', () => {
    fakeDocument();
    const gone = (stone: Medal) => {
      const stage = createStage(1);
      const machine = createMachine(3);
      machine.medals = [stone];
      trackMedals(stage, machine, 0);
      machine.medals = [];
      trackMedals(stage, machine, 0);
      return stage;
    };
    const front = gone(jewel(7, 40, D + 0.1, 0));
    expect(front.exits).toEqual([{ id: 7, x: 40, y: D + 0.1, kind: 'won', side: -1, ball: false, jewel: true, age: 0 }]);
    expect(front.trayGlow).toBe(GLOW_TIME);
    expect(front.sparks).toHaveLength(14);
    expect(new Set(front.sparks.map((spark) => spark.color))).toEqual(new Set(['#ff7cc0', '#ffffff', '#ffd0ea']));
    // One that was last seen hard against a side went over the front all the same: it does not fit through the side.
    const corner = gone(jewel(8, FIELD.width - MEDAL_RADIUS, D - 0.2, 0));
    expect(corner.exits[0]).toMatchObject({ kind: 'won', jewel: true });
    expect(corner.sideGlow).toEqual([0, 0]);
    expect(corner.trayGlow).toBe(GLOW_TIME);
    // A medal that leaves says nothing about being a jewel.
    expect(gone(plain(9, 40, D + 0.1)).exits[0]).not.toHaveProperty('jewel');
    // It is gone from the picture as soon as a medal would be.
    ageStage(front, EXIT_TIME + 0.01);
    expect(front.exits).toEqual([]);
  });

  it('has a plate with five sockets in the front of the lower table, in the layer that is drawn once', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => [...canvas.starts, ...canvas.lines]);
    for (const [x, height] of [
      [JEWEL_PLATE.from, JEWEL_PLATE.top],
      [JEWEL_PLATE.to, JEWEL_PLATE.top],
      [JEWEL_PLATE.to, JEWEL_PLATE.foot],
      [JEWEL_PLATE.from, JEWEL_PLATE.foot],
    ]) {
      expect(near(once, project(x, height, D))).toBe(true);
    }
    for (let lamp = 0; lamp < JEWEL_LAMPS.count; lamp++) {
      for (const [across, up] of LAMP_OUTLINE) expect(near(once, project(jewelLampX(lamp) + across * JEWEL_LAMPS.radius, JEWEL_LAMPS.height + up * JEWEL_LAMPS.radius, D))).toBe(true);
    }
    // The arrows down into the tray keep clear of it: none is drawn where the plate is.
    const starts = made.flatMap((canvas) => canvas.starts);
    const arrowsOn = (from: number, to: number) => starts.filter((point) => Math.abs(point.y - project(50, -7.5, D).y) < 0.5 && point.x > project(from, -7.5, D).x && point.x < project(to, -7.5, D).x).length;
    expect(arrowsOn(JEWEL_PLATE.from, JEWEL_PLATE.to)).toBe(0);
    expect(arrowsOn(0, JEWEL_PLATE.from)).toBeGreaterThanOrEqual(2);
    expect(arrowsOn(JEWEL_PLATE.to, FIELD.width)).toBeGreaterThanOrEqual(2);
  });

  it('lights the lamps from the left, one for each jewel collected, and all five while a bonus is shown', () => {
    fakeDocument();
    /** Which lamps were drawn lit in a frame: each is the outline of a cut stone, traced on the plate. */
    const lit = (count: number, stage: Stage = createStage(1), calm = true) => {
      const { screen } = frame([], { calm, jewels: count }, stage);
      return Array.from({ length: JEWEL_LAMPS.count }, (_, lamp) => LAMP_OUTLINE.every(([across, up]) => near(drawnAt(screen), project(jewelLampX(lamp) + across * JEWEL_LAMPS.radius, JEWEL_LAMPS.height + up * JEWEL_LAMPS.radius, D))));
    };
    for (let count = 0; count < JEWEL_LAMPS.count; count++) expect(lit(count)).toEqual(Array.from({ length: JEWEL_LAMPS.count }, (_, lamp) => lamp < count));
    // The bonus has put them out; while it is shown all five are lit, with reduced motion or without, and then none.
    const stage = createStage(1);
    showJewel(stage, JEWEL_LAMPS.count - 1, 3, true);
    expect(lit(0, stage, true)).toEqual([true, true, true, true, true]);
    expect(lit(0, stage, false)).toEqual([true, true, true, true, true]);
    ageStage(stage, JEWEL_SHOW + 0.1);
    expect(lit(0, stage)).toEqual([false, false, false, false, false]);
  });

  it('shows what a jewel paid floating up from the plate in the jewel\u2019s colour, with sparks from the lamp it lit', () => {
    fakeDocument();
    const stage = createStage(1);
    showJewel(stage, 2, 1, false);
    expect(stage.jewelGlow).toBe(GLOW_TIME);
    expect(stage.jewelShow).toBe(0);
    expect(stage.sparks).toHaveLength(14);
    // The sparks start at the lamp that was lit.
    const lamp = project(jewelLampX(2), JEWEL_LAMPS.height, D);
    for (const spark of stage.sparks) expect([spark.x, spark.y]).toEqual([lamp.x, lamp.y]);
    const { screen } = frame([], { calm: true, jewels: 3 }, stage);
    const word = screen.texts.filter((entry) => entry.text === 'JEWEL +1');
    expect(word).toHaveLength(1);
    expect(word[0].style).toBe('#ffb7dc');
    // Over the plate, in the middle of the front.
    expect(word[0].x).toBeCloseTo(project(FIELD.width / 2, JEWEL_PLATE.top, D).x, 6);
    expect(word[0].y).toBeLessThan(project(FIELD.width / 2, JEWEL_PLATE.top, D).y);
    // A bonus says so, with more sparks all along the plate, and the lamps' show.
    const bonus = createStage(1);
    showJewel(bonus, JEWEL_LAMPS.count - 1, 3, true);
    expect(bonus.jewelShow).toBe(JEWEL_SHOW);
    expect(bonus.sparks).toHaveLength(40);
    expect(new Set(bonus.sparks.map((spark) => Math.round(spark.x))).size).toBeGreaterThan(10);
    expect(frame([], { calm: true }, bonus).screen.texts.map((entry) => entry.text)).toContain('JEWEL BONUS +3');
    // Both are gone a second or so later.
    ageStage(bonus, 1.01);
    ageStage(bonus, JEWEL_SHOW);
    expect(bonus.popups).toEqual([]);
    expect([bonus.jewelGlow, bonus.jewelShow]).toEqual([0, 0]);
  });
});
