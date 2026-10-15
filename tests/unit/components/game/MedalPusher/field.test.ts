import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, SLOT, armCollar, armStart, armTip, fedSpot, legOf, letGo, railFrame, rollingSpot, slotSpot } from '@/components/game/MedalPusher/arms';
import {
  CATCHER,
  HOLE_MIDDLE,
  RIM_REACHED,
  SIGN,
  SLOPE,
  START_SLOT,
  lampSpot,
  litSlots,
  mouthOnDrawing,
  mouthSpots,
  plateCorners,
  plateWay,
  rolledDown,
  signSpot,
  slidDown,
  slopeSpot,
  slotCorners,
  slotHalf,
  underCatcher,
  wingCorners,
} from '@/components/game/MedalPusher/catcher';
import { CHUCKERS } from '@/components/game/MedalPusher/chuckers';
import {
  AIM,
  ARM_REACH,
  CHECKERS,
  FALL_TIME,
  FIELD,
  MEDAL_RADIUS,
  FEED,
  LUCKY,
  PRIZE_LANDS,
  ROLL_DOWN,
  ROLL_TIME,
  START_RIDE,
  TOWER,
  createMachine,
  dropJewel,
  luckySlot,
  pusherFront,
  queuePayout,
  step,
  type Arm,
  type FallingMedal,
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
  BALL_RADIUS,
  BURST,
  ENTRY_INK,
  ENTRY_WORDS,
  EXIT_TIME,
  GLOW_TIME,
  GOLD_FLASH,
  HOLD_COUNT,
  HOLE_SHADE,
  RIDE,
  SLOT_LIGHT,
  TRAY,
  ageStage,
  railedJewel,
  celebrate,
  createStage,
  drawField,
  drawOverlay,
  dropEntries,
  enterGate,
  entryTimes,
  faceOf,
  goldFlash,
  holdCount,
  holdShown,
  lampFor,
  lightGate,
  showJewel,
  trackMedals,
  type DrawOptions,
  type Entry,
  type ExitingMedal,
  type Stage,
} from '@/components/game/MedalPusher/render';
import { MEDAL_SHADE } from '@/components/game/MedalPusher/medalLook';
import { MAX_STOCK, advance, createSession, insert, type SessionEvent } from '@/components/game/MedalPusher/session';
import { SIDE_HOLE, acrossAt, holeFloor, railTop, railed, sinking } from '@/components/game/MedalPusher/sidehole';
import { CHUTE, HEIGHT, HOLD_LAMPS, HOUSING, SCREEN, VIEW, chuteHeight, project, rise } from '@/components/game/MedalPusher/view';
import { STACK, idleTube } from '@/components/game/MedalPusher/stacker';
import { pourPose } from '@/components/game/MedalPusher/works';

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
 * An outline as it was filled: the colour it was filled with (none, if it was a gradient), the colours of the
 * gradient it was filled with, from its first to its last (none, if it was one colour), how much of it shows
 * through, the points its straight edges go through, the circles in it, each by its middle and how big it is on
 * the drawing, and whether the canvas was drawing only inside some other outline.
 */
interface Fill {
  style: string;
  stops: string[];
  alpha: number;
  points: { x: number; y: number }[];
  rounds: { x: number; y: number; r: number }[];
  clipped: boolean;
}

/**
 * A stand-in for a canvas's 2D context. It draws nothing and remembers what
 * the tests look for: every piece of text, at the pixel it was drawn, how
 * large and in what colour; every point a path was started from or carried
 * on to; every stretch of an ellipse; every rectangle filled, by where it was
 * asked for and in what colour; every outline filled, with what is in it;
 * every image stamped; and the order the words and the images came in, each
 * image by its place among the stamps; and every path that was stroked, by
 * how wide its line was and the stretches of ellipse in it. It keeps the
 * transform as a canvas does, through `save` and `restore` too.
 */
function recorder() {
  const arcs: Arc[] = [];
  const fills: Fill[] = [];
  let outline: Pick<Fill, 'points' | 'rounds'> = { points: [], rounds: [] };
  const texts: { text: string; x: number; y: number; wide: number; tall: number; style: string }[] = [];
  const starts: { x: number; y: number }[] = [];
  const lines: { x: number; y: number }[] = [];
  const stamps: Stamp[] = [];
  const rects: { at: [number, number]; style: string }[] = [];
  const strokes: { width: number; arcs: Arc[] }[] = [];
  const log: string[] = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let alpha = 1;
  let width = 1;
  let begun = 0;
  let style = '';
  let stops: string[] = [];
  let clipped = false;
  const saved: { matrix: number[]; alpha: number; clipped: boolean }[] = [];
  const at = (x: number, y: number) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  const gradient = { addColorStop: () => undefined };
  /** A gradient that remembers the colours it is given, in the order it is given them. */
  const wash = () => {
    const colours: string[] = [];
    return { colours, addColorStop: (_at: number, colour: string) => colours.push(colour) };
  };
  const own: Record<string, unknown> = {
    createLinearGradient: wash,
    createRadialGradient: wash,
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
    beginPath: () => {
      outline = { points: [], rounds: [] };
      begun = arcs.length;
    },
    stroke: () => {
      strokes.push({ width: width * Math.hypot(matrix[0], matrix[1]), arcs: arcs.slice(begun) });
      // A straight line that was stroked is in the order of things by its two ends.
      if (outline.points.length === 2) log.push(`line:${outline.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}`);
    },
    moveTo: (x: number, y: number) => {
      starts.push(at(x, y));
      outline.points.push(at(x, y));
    },
    lineTo: (x: number, y: number) => {
      lines.push(at(x, y));
      outline.points.push(at(x, y));
    },
    arc: (x: number, y: number, r: number) => {
      outline.rounds.push({ ...at(x, y), r: r * Math.hypot(matrix[0], matrix[1]) });
    },
    fill: () => {
      fills.push({ style, stops, alpha, points: [...outline.points], rounds: [...outline.rounds], clipped });
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
      if (name === 'lineWidth' && typeof value === 'number') width = value;
      if (name === 'fillStyle') {
        style = typeof value === 'string' ? value : '';
        stops = typeof value === 'string' ? [] : ((value as { colours?: string[] }).colours ?? []);
      }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, texts, starts, lines, stamps, arcs, rects, fills, strokes, log };
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

describe('the START plate on the canvas', () => {
  /** One frame of the field at `time`, and what it drew. */
  const frame = (time: number, calm: boolean, options: Partial<DrawOptions> = {}) => {
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = time;
    const screen = recorder();
    drawField(screen.context, stage, machine, { showGuide: true, calm, ...options });
    return screen;
  };
  /** Moments all through the pusher's stroke: out, back, and on the way. */
  const TIMES = [0, 0.75, 1.5, 2.2, 4.5, 5.3];
  const P = HEIGHT.pusher;
  const near = (points: { x: number; y: number }[], x: number, y: number, within = 1e-6) => points.some((point) => Math.hypot(point.x - x, point.y - y) < within);
  const seen = (spot: { x: number; height: number; depth: number }) => project(spot.x, spot.height, spot.depth);
  /** How many pixels of a phone's screen a pixel of the drawing is, when the stage is as wide as it is on a 375-pixel page. */
  const PHONE = 345 / VIEW.width;
  /**
   * A hole at `time`, on the drawing: the four corners of its opening; of the frame let in round it, inside and out;
   * and of the wall under its upper edge, down to the underside of the board; each from the upper left one round by the right.
   */
  const holeOnDrawing = (pocket: number, time: number, wings = false) => {
    const opening = slotCorners(pocket, time, wings).map(seen);
    const sunk = slotCorners(pocket, time, wings, 0, -CATCHER.thick).map(seen);
    return {
      opening,
      frame: [...slotCorners(pocket, time, true, CATCHER.rim.wide).map(seen), ...slotCorners(pocket, time, true).map(seen)],
      wall: [opening[0], opening[1], sunk[1], sunk[0]],
    };
  };
  /** The outlines a frame filled that go through every one of these points. */
  const through = (screen: Recorder, points: { x: number; y: number }[]) => screen.fills.filter((fill) => points.every((point) => near(fill.points, point.x, point.y)));
  /**
   * How each hole looks in one frame of this stage, from the left: its frame and the wall under its upper edge, each as
   * it was filled; its lamp, and how big a field unit is there; what was laid over its opening, in order, each by what it
   * was filled with and how much of it shows; and the glows over it.
   */
  const holeLooks = (stage: ReturnType<typeof createStage>, machine: Machine, options: DrawOptions) => {
    const screen = recorder();
    drawField(screen.context, stage, machine, options);
    return CHECKERS.positions.map((_x, pocket) => {
      const { opening, frame, wall } = holeOnDrawing(pocket, machine.time, options.wings);
      const [top] = through(screen, frame).filter((fill) => fill.points.length === 8);
      const [inside] = through(screen, wall).filter((fill) => fill.points.length === 4 && fill.clipped);
      // The lamp is a circle with its middle where the plate has the lamp. Its dark body comes first and its light last.
      const spot = seen(lampSpot(pocket, machine.time));
      const lamps = screen.fills.filter((fill) => fill.points.length === 0 && fill.rounds.length === 1 && Math.hypot(fill.rounds[0].x - spot.x, fill.rounds[0].y - spot.y) < 1e-6);
      const lamp = lamps[lamps.length - 1];
      if (!top || !inside || !lamp) throw new Error(`hole ${pocket} was not drawn`);
      const over = through(screen, opening).filter((fill) => fill.points.length === 4 && fill.clipped);
      const middle = mouthOnDrawing(pocket, machine.time, options.wings);
      const glows = screen.fills.filter((fill) => fill.points.length === 0 && fill.rounds.length === 1 && Math.hypot(fill.rounds[0].x - middle.x, fill.rounds[0].y - middle.y) < 1e-6);
      return {
        frame: { style: top.style, alpha: top.alpha },
        inside: { style: inside.style, alpha: inside.alpha },
        lamp: { style: lamp.style, alpha: lamp.alpha, r: lamp.rounds[0].r },
        lampScale: spot.scale,
        over: over.map((fill) => ({ style: fill.style, alpha: fill.alpha })),
        glows: glows.length,
      };
    });
  };
  /** The shade laid down every hole: what lies under the plate is in its shade. */
  const SHADE = `rgba(0, 4, 18, ${HOLE_SHADE})`;

  it('paints nothing of the plate into the layer that is drawn once: it rides with the pusher', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => canvas.texts.map((entry) => entry.text));
    // The words on the table and under the screen are there, so the layer was recorded; the plate's are not.
    expect(once.filter((text) => text === 'GET')).toHaveLength(3);
    expect(once.filter((text) => text === 'OUT')).toHaveLength(4);
    expect(once.filter((text) => text === 'HOLD')).toHaveLength(1);
    expect(once).not.toContain('START');
  });

  it('writes START on each of its two signs, toward the sign’s outer end, tall enough to read on a phone, wherever the stroke has taken it', () => {
    fakeDocument();
    const heights = new Set<number>();
    for (const time of TIMES) {
      const words = frame(time, false).texts.filter((entry) => entry.text === 'START');
      expect(words).toHaveLength(2);
      words.forEach((word, index) => {
        const side = index === 0 ? -1 : 1;
        // On its sign, toward the end away from the holes, half way down it.
        const outer = seen(signSpot(side, side < 0 ? 0 : SIGN.wide, SIGN.long / 2, time));
        const inner = seen(signSpot(side, side < 0 ? SIGN.wide : 0, SIGN.long / 2, time));
        expect(Math.abs(word.x - outer.x)).toBeLessThan(Math.abs(word.x - inner.x));
        expect(word.y).toBeGreaterThan(seen(signSpot(side, SIGN.wide / 2, 0, time)).y);
        expect(word.y).toBeLessThan(seen(signSpot(side, SIGN.wide / 2, SIGN.long, time)).y);
        // Its capitals, as the canvas was told to draw them: a canvas that cannot measure is taken to draw them 7.16 tall at the size asked for.
        expect(7.16 * word.tall * PHONE).toBeGreaterThanOrEqual(6.5);
        heights.add(Math.round(word.y));
      });
      // The left sign's to the left of the holes, and the right one's to the right.
      expect(words[0].x).toBeLessThan(mouthOnDrawing(0, time).x);
      expect(words[1].x).toBeGreaterThan(mouthOnDrawing(2, time).x);
    }
    // It rides out and back with the pusher: lower on the drawing the further out the lip is.
    expect(heights.size).toBeGreaterThan(3);
  });

  it('draws the board as one piece from the lip to its foot, with the holes’ openings cut out of it, and the plumb end of its foot', () => {
    fakeDocument();
    for (const time of TIMES) {
      const front = pusherFront(time);
      const screen = frame(time, false);
      const corners = plateCorners(time).map(seen);
      const openings = CHECKERS.positions.flatMap((_x, pocket) => holeOnDrawing(pocket, time).opening);
      const boards = through(screen, [...corners, ...openings]).filter((fill) => fill.points.length === 16);
      expect(boards).toHaveLength(1);
      expect(boards[0].stops).toEqual(['#7f8aad', '#dfe5f4']);
      // From the lip itself: the plate begins at the lip and nothing is between.
      expect(corners[0].y).toBeCloseTo(project(0, CATCHER.deck, front).y, 9);
      // It leans toward the player: its foot is lower on the drawing than a level board from the lip would reach as far out.
      expect(corners[2].y).toBeGreaterThan(project(CATCHER.to, CATCHER.deck, front + CATCHER.foot.out).y);
      // The plumb end of its foot, from the edge of its top straight down by the board's thickness, lit.
      const end = CATCHER.thick / Math.cos(SLOPE.angle);
      const foot = [project(0, CATCHER.foot.height, front + CATCHER.foot.out), project(FIELD.width, CATCHER.foot.height, front + CATCHER.foot.out), project(FIELD.width, CATCHER.foot.height - end, front + CATCHER.foot.out)];
      expect(through(screen, foot).filter((fill) => fill.style === '#c9d1ea')).toHaveLength(1);
      // Nothing of a well: nothing is drawn under the lip that the board does not cover.
      expect(screen.fills.some((fill) => fill.stops.join() === '#0c0a1a,#08061a')).toBe(false);
    }
  });

  it('draws every hole as an opening with square corners in the board: as wide as its pocket, a frame let in round it, and the wall under its upper edge down inside it', () => {
    fakeDocument();
    for (const time of TIMES) {
      const screen = frame(time, false);
      mouthSpots(time).forEach((spot, pocket) => {
        const { opening, frame: round, wall } = holeOnDrawing(pocket, time);
        // The frame is one piece round the opening, as wide as the opening is with its flaps open.
        const tops = through(screen, round).filter((fill) => fill.points.length === 8);
        expect(tops).toHaveLength(1);
        expect(tops[0].clipped).toBe(false);
        // Square corners, seen from in front: the upper edge and the lower edge are level, and the lower one, which is nearer, is the longer.
        expect(opening[0].y).toBeCloseTo(opening[1].y, 9);
        expect(opening[3].y).toBeCloseTo(opening[2].y, 9);
        expect(opening[2].x - opening[3].x).toBeGreaterThan(opening[1].x - opening[0].x);
        // It is where the plate says the hole is on the drawing, as wide and as tall, and it is big enough to see on a phone.
        const mouth = mouthOnDrawing(pocket, time);
        expect(opening[0].y).toBeLessThan(mouth.y);
        expect(opening[3].y).toBeGreaterThan(mouth.y);
        expect(opening[3].y - opening[0].y).toBeCloseTo(mouth.tall, 9);
        expect(mouth.wide * PHONE).toBeGreaterThan(18);
        expect(mouth.tall * PHONE).toBeGreaterThan(12);
        expect(mouth.wide).toBeCloseTo((MEDAL_RADIUS + CHECKERS.halfWidth) * 2 * seen(slopeSpot(spot.x, HOLE_MIDDLE, time)).scale, 9);
        // All of it below the lip.
        expect(round[0].y).toBeGreaterThan(project(spot.x, P, pusherFront(time)).y);
        // Down inside it, and only inside it: the shade under the plate over the whole opening, and the wall under its upper edge.
        const shades = through(screen, opening).filter((fill) => fill.points.length === 4 && fill.style === SHADE);
        expect(shades).toHaveLength(1);
        expect(shades[0].clipped).toBe(true);
        const walls = through(screen, wall).filter((fill) => fill.points.length === 4);
        expect(walls).toHaveLength(1);
        expect(walls[0].clipped).toBe(true);
      });
    }
  });

  it('gives each hole its own colour while it waits, and lights the one the lucky lamp is on gold, steadily: its frame, the inside of it, its lamp, which is bigger, and a wash of gold down it', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    expect(new Set(SLOT_LIGHT.own).size).toBe(CHUCKERS.count);
    expect(new Set([SLOT_LIGHT.idle, SLOT_LIGHT.gold, SLOT_LIGHT.flash]).size).toBe(3);
    for (let stroke = 0; stroke <= CHUCKERS.count; stroke++) {
      machine.time = (stroke + 0.3) * LUCKY.dwell;
      const lucky = luckySlot(machine.time);
      expect(lucky).toBe(stroke % CHUCKERS.count);
      expect(litSlots(machine.time).indexOf(true)).toBe(lucky);
      const looks = [0, 0.13, 0.31, 0.77, 1.5].map((later) => {
        stage.clock = 5 + later;
        return holeLooks(stage, machine, { showGuide: false });
      });
      for (const look of looks) {
        look.forEach((hole, pocket) => {
          expect(hole.frame.style).toBe(pocket === lucky ? SLOT_LIGHT.gold : SLOT_LIGHT.idle);
          expect(hole.inside.style).toBe(pocket === lucky ? SLOT_LIGHT.flash : SLOT_LIGHT.own[pocket]);
          expect(hole.lamp.style).toBe(pocket === lucky ? SLOT_LIGHT.lamp : SLOT_LIGHT.own[pocket]);
          expect(hole.frame.alpha).toBe(1);
          expect(hole.lamp.r / hole.lampScale).toBeCloseTo(START_SLOT.lamp.radius * (pocket === lucky ? 1.25 : 1), 6);
          // The shade down every hole, and the gold of the lucky one over it; nothing more over a hole nobody has put a medal down.
          expect(hole.over).toEqual(pocket === lucky ? [{ style: SHADE, alpha: 1 }, { style: 'rgba(255, 214, 92, 0.22)', alpha: 1 }] : [{ style: SHADE, alpha: 1 }]);
          expect(hole.glows).toBe(pocket === lucky ? 1 : 0);
        });
        // The lit hole is wholly lit in every frame, and exactly as it was in the frame before: it does not flash.
        expect(look[lucky].inside.alpha).toBe(1);
        expect(look[lucky].lamp.alpha).toBe(1);
        expect(look[lucky]).toEqual(looks[0][lucky]);
      }
    }
  });

  it('opens the flaps during chance time: all three holes gold, their openings wider, and the flaps hanging under the plate instead of lying flush along them', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    for (const time of [0.4, 1.5, LUCKY.dwell * 1.6]) {
      machine.time = time;
      const draw = (options: DrawOptions) => {
        const screen = recorder();
        drawField(screen.context, stage, machine, options);
        return screen;
      };
      const shut = draw({ showGuide: false });
      const open = draw({ showGuide: false, wings: true });
      for (const hole of holeLooks(stage, machine, { showGuide: false, wings: true })) {
        expect(hole.frame.style).toBe(SLOT_LIGHT.gold);
        expect(hole.inside.style).toBe(SLOT_LIGHT.flash);
        expect(hole.lamp.style).toBe(SLOT_LIGHT.lamp);
        expect(hole.lamp.r / hole.lampScale).toBeCloseTo(START_SLOT.lamp.radius * 1.25, 6);
      }
      // The board has the wider openings cut out of it with the flaps open, and the narrower ones with them shut.
      const corners = plateCorners(time).map(seen);
      const cut = (wings: boolean) => [...corners, ...CHECKERS.positions.flatMap((_x, pocket) => holeOnDrawing(pocket, time, wings).opening)];
      expect(through(shut, cut(false)).filter((fill) => fill.points.length === 16)).toHaveLength(1);
      expect(through(open, cut(true)).filter((fill) => fill.points.length === 16)).toHaveLength(1);
      expect(through(open, cut(false)).filter((fill) => fill.points.length === 16)).toHaveLength(0);
      for (let pocket = 0; pocket < CHUCKERS.count; pocket++) {
        const narrow = holeOnDrawing(pocket, time);
        const wide = holeOnDrawing(pocket, time, true);
        expect((wide.opening[1].x - wide.opening[0].x) / (narrow.opening[1].x - narrow.opening[0].x)).toBeCloseTo(slotHalf(true) / slotHalf(), 9);
        for (const side of [-1, 1]) {
          // Shut, a flap is drawn flush in the plate, in the open; open, it is drawn hanging down the inside of the hole, seen only down it.
          const flush = wingCorners(pocket, side, time, false).map(seen);
          const hanging = wingCorners(pocket, side, time, true).map(seen);
          const flushes = through(shut, flush).filter((fill) => fill.points.length === 4);
          expect(flushes).toHaveLength(1);
          expect(flushes[0].clipped).toBe(false);
          expect(through(open, flush).filter((fill) => fill.points.length === 4)).toHaveLength(0);
          const hangs = through(open, hanging).filter((fill) => fill.points.length === 4);
          expect(hangs).toHaveLength(1);
          expect(hangs[0].clipped).toBe(true);
          expect(through(shut, hanging).filter((fill) => fill.points.length === 4)).toHaveLength(0);
        }
      }
    }
  });

  it('flashes a hole a medal has just gone down brighter than gold, with a wash of light down it, and lights both signs, for as long as it shines', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const lucky = luckySlot(machine.time);
    const gate = (lucky + 2) % CHUCKERS.count;
    const idle = (lucky + 1) % CHUCKERS.count;
    /** The signs' plates that were filled over with light, and the colours of their words. */
    const signs = () => {
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false });
      return { lit: screen.rects.filter((rect) => rect.style.startsWith('rgba(255, 244, 150')).length, words: screen.texts.filter((entry) => entry.text === 'START').map((entry) => entry.style) };
    };
    expect(signs()).toEqual({ lit: 0, words: ['#fff6c4', '#fff6c4'] });
    lightGate(stage, gate);
    const lit = holeLooks(stage, machine, { showGuide: false });
    expect(lit[gate].frame.style).toBe(SLOT_LIGHT.flash);
    expect(lit[gate].inside.style).toBe(SLOT_LIGHT.flash);
    expect(lit[gate].lamp.style).toBe(SLOT_LIGHT.lamp);
    expect(lit[gate].over.map((fill) => fill.style)).toEqual([SHADE, expect.stringMatching(/^rgba\(255, 251, 224, /)]);
    expect(lit[gate].glows).toBe(1);
    expect(lit[lucky].frame.style).toBe(SLOT_LIGHT.gold);
    expect(lit[idle].frame.style).toBe(SLOT_LIGHT.idle);
    expect(lit[idle].over).toEqual([{ style: SHADE, alpha: 1 }]);
    expect(signs()).toEqual({ lit: 2, words: ['#ffffff', '#ffffff'] });
    // Half way through it is still lit; when the time is up it is a hole that waits again, and the signs are as they were.
    ageStage(stage, GLOW_TIME / 2);
    expect(holeLooks(stage, machine, { showGuide: false })[gate].frame.style).toBe(SLOT_LIGHT.flash);
    ageStage(stage, GLOW_TIME / 2 + 0.01);
    const after = holeLooks(stage, machine, { showGuide: false });
    expect(after[gate].frame.style).toBe(SLOT_LIGHT.idle);
    expect(after[gate].over).toEqual([{ style: SHADE, alpha: 1 }]);
    expect(signs().lit).toBe(0);
  });

  it('lets nothing about a hole flash faster than the cabinet’s one rate, in a fever and a jackpot as at any other time, and nothing at all with motion reduced', () => {
    fakeDocument();
    const machine = createMachine(3);
    machine.medals = [];
    machine.time = 1.5;
    const lucky = luckySlot(machine.time);
    const SECONDS = 2;
    const risings = (shown: number[]) => {
      const middle = (Math.max(...shown) + Math.min(...shown)) / 2;
      return shown.filter((bright, at) => at > 0 && shown[at - 1] < middle && bright >= middle).length;
    };
    for (const party of [null, 'fever', 'jackpot'] as const) {
      for (const calm of [false, true]) {
        const stage = createStage(1);
        if (party) celebrate(stage, party);
        const shown = CHECKERS.positions.map(() => ({ inside: [] as number[], lamp: [] as number[] }));
        for (let at = 0; at <= SECONDS * 30; at++) {
          stage.clock = 3 + at / 30;
          holeLooks(stage, machine, { showGuide: false, calm }).forEach((hole, pocket) => {
            shown[pocket].inside.push(hole.inside.alpha);
            shown[pocket].lamp.push(hole.lamp.alpha);
          });
        }
        shown.forEach((lights, pocket) => {
          for (const light of [lights.inside, lights.lamp]) {
            const swing = Math.max(...light) - Math.min(...light);
            if (pocket === lucky || calm) expect(swing).toBe(0);
            else {
              expect(swing).toBeGreaterThan(0);
              expect(Math.min(...light)).toBeGreaterThan(0.5);
              expect(risings(light)).toBeLessThanOrEqual(GOLD_FLASH.perSecond * SECONDS);
            }
          }
        });
      }
    }
  });

  it('draws the plate in the same place with reduced motion: it is part of the machine', () => {
    fakeDocument();
    for (const time of TIMES) {
      const moving = frame(time, false);
      const calm = frame(time, true);
      expect(calm.texts.filter((entry) => entry.text === 'START')).toEqual(moving.texts.filter((entry) => entry.text === 'START'));
      for (let pocket = 0; pocket < CHUCKERS.count; pocket++) {
        const { opening, frame: round, wall } = holeOnDrawing(pocket, time);
        for (const outline of [round, wall, opening]) expect(through(calm, outline).map((fill) => fill.points)).toEqual(through(moving, outline).map((fill) => fill.points));
      }
    }
  });

  /** A medal that went over the lip at `x`, on its way down the plate `elapsed` seconds later, on a machine at 1.5 seconds; and one frame of the field with only it on it. */
  const lone = (id: number, x: number) => {
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.medals = [];
    machine.time = 1.5;
    machine.medals = [{ id, x, y: pusherFront(machine.time) + 0.5, level: 1, tier: 0, sinceDrop: -1, stack: 1, ball: false, grown: 1 }];
    step(machine, 1 / 60);
    const [medal] = machine.falling;
    const at = (elapsed: number): FallingMedal => ({ ...medal, remaining: medal.duration - elapsed });
    /** What was drawn, the pictures of medals among it, and whether the medal's was drawn after the plate. */
    const drawn = (elapsed: number, options: Partial<DrawOptions> = {}) => {
      machine.falling = [at(elapsed)];
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false, ...options });
      const stamps = screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement));
      return { screen, stamps, after: screen.log.indexOf(`image:${screen.stamps.indexOf(stamps[0])}`) > screen.log.indexOf('text:START') };
    };
    return { machine, medal, at, drawn };
  };

  it('draws a medal on its way down a hole whole and after the plate while it is on the plate, then only down the opening, darker as it goes', () => {
    fakeDocument();
    const { machine, medal, at, drawn } = lone(901, CHECKERS.positions[0] + 0.5);
    expect(plateWay(medal, machine.time)).toEqual({ kind: 'hole', hole: 0 });
    let darkest = 1;
    for (let elapsed = 0.01; elapsed < START_RIDE; elapsed += 1 / 60) {
      const held = slidDown(at(elapsed), machine.time);
      if (!held) throw new Error('not on its way');
      const { screen, stamps, after } = drawn(elapsed);
      // One picture of it, after the plate, and none where the engine will put it down.
      expect(stamps).toHaveLength(1);
      expect(after).toBe(true);
      expect(stamps[0].clipped).toBe(held.leg === 'slot');
      // Its face is half its thickness over where the plate has its middle.
      const face = seen({ x: held.x - Math.sin(held.heading) * Math.sin(held.tilt) * (HEIGHT.medal / 2), height: held.height + Math.cos(held.tilt) * (HEIGHT.medal / 2), depth: held.depth + Math.cos(held.heading) * Math.sin(held.tilt) * (HEIGHT.medal / 2) });
      expect(stamps[0].x).toBeCloseTo(face.x, 6);
      expect(stamps[0].y).toBeCloseTo(face.y, 6);
      // Darker under the plate: a shade laid over it as dark as it is in the dark.
      const shade = screen.fills.filter((fill) => fill.style === MEDAL_SHADE.dark && fill.rounds.length === 1);
      expect(shade.length > 0).toBe(held.light < 1);
      if (shade.length > 0) expect(shade[0].alpha).toBeCloseTo(1 - held.light, 9);
      darkest = Math.min(darkest, held.light);
    }
    expect(darkest).toBeCloseTo(CATCHER.shade, 9);
  });

  it('draws a medal that slides past the holes whole, after the plate, all the way off its foot; and one that rocks on a hole’s frame rocked over it, and not with motion reduced', () => {
    fakeDocument();
    const { medal, at, drawn } = lone(902, 15);
    for (let elapsed = 0; elapsed <= medal.duration; elapsed += medal.duration / 12) {
      const { stamps, after } = drawn(elapsed);
      expect(stamps).toHaveLength(1);
      expect(after).toBe(true);
      expect(stamps[0].clipped).toBe(false);
    }
    const missed = lone(903, CHECKERS.positions[1] + CHECKERS.halfWidth + 0.4);
    const rocking = missed.at(RIM_REACHED + 0.1);
    const held = slidDown(rocking, missed.machine.time);
    expect(held?.leg).toBe('rim');
    const { stamps } = missed.drawn(RIM_REACHED + 0.1);
    expect(stamps).toHaveLength(1);
    expect(stamps[0].clipped).toBe(false);
    // Rocked toward the hole, which is to its left: its face is turned, and is not with motion reduced.
    const calm = missed.drawn(RIM_REACHED + 0.1, { calm: true }).stamps;
    expect(stamps[0].turn).not.toBeCloseTo(calm[0].turn, 3);
    expect(slidDown(rocking, missed.machine.time, true)?.leg).not.toBe('rim');
    expect(at(0).source).toBe('slide');
  });

  it('draws a ball on the lower table after the plate, which is never over one, and one rolling down the plate last, where the plate has it', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    const ball = (x: number, y: number): Medal => ({ id: 902, x, y, level: 0, tier: 0, sinceDrop: -1, stack: 1, ball: true, grown: 1 });
    /** A ball rolling down the plate, `share` of the way down. */
    const rolling = (share: number): FallingMedal => ({ id: 903, x: 39, y: pusherFront(machine.time + ROLL_DOWN * (1 - share)) + CATCHER.foot.out + PRIZE_LANDS.ball, level: 0, fromX: 39, fromY: front, rank: 0, ball: true, remaining: ROLL_DOWN * (1 - share), duration: ROLL_DOWN, source: 'slide' });
    const order = (medals: Medal[], falling: FallingMedal[] = []) => {
      machine.medals = medals;
      machine.falling = falling;
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false });
      const balls = screen.stamps.flatMap((stamp, index) => (stamp.image === stage.ball ? [index] : []));
      expect(balls).toHaveLength(1);
      return { ball: screen.log.indexOf(`image:${balls[0]}`), plate: screen.log.indexOf('text:START'), stamp: screen.stamps[balls[0]] };
    };
    expect(BALL_RADIUS * 2).toBeGreaterThan(CATCHER.deck);
    for (const [x, y] of [
      [39, front + CATCHER.foot.out + PRIZE_LANDS.ball],
      [10, front + CATCHER.foot.out + PRIZE_LANDS.ball + 3],
      [39, 90],
    ]) {
      expect(underCatcher(x, y, 0, machine.time)).toBe(false);
      const lying = order([ball(x, y)]);
      expect(lying.ball).toBeGreaterThan(lying.plate);
      expect(lying.stamp.clipped).toBe(false);
      expect(lying.stamp.y).toBeCloseTo(project(x, BALL_RADIUS, y).y, 6);
    }
    let last = -Infinity;
    for (const share of [0.02, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      const going = rolling(share);
      const at = rolledDown(going, BALL_RADIUS, machine.time);
      if (!at) throw new Error('not rolling');
      const drawn = order([], [going]);
      expect(drawn.ball).toBeGreaterThan(drawn.plate);
      expect(drawn.stamp.clipped).toBe(false);
      expect(drawn.stamp.x).toBeCloseTo(seen(at).x, 6);
      expect(drawn.stamp.y).toBeCloseTo(seen(at).y, 6);
      expect(drawn.stamp.y).toBeGreaterThan(last);
      last = drawn.stamp.y;
    }
  });

  it('draws two balls rolling down the plate the nearer one last, whichever of them the machine holds first', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    const rolling = (id: number, x: number, share: number, out = 0): FallingMedal => ({ id, x, y: pusherFront(machine.time + ROLL_DOWN * (1 - share)) + CATCHER.foot.out + PRIZE_LANDS.ball + out, level: 0, fromX: x, fromY: front, rank: 0, ball: true, remaining: ROLL_DOWN * (1 - share), duration: ROLL_DOWN, source: 'slide' });
    const drawn = (falling: FallingMedal[]) => {
      machine.medals = [];
      machine.falling = falling;
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false });
      const plate = screen.log.indexOf('text:START');
      const balls = screen.stamps.flatMap((stamp, index) => (stamp.image === stage.ball ? [index] : []));
      return balls.map((index) => ({ x: screen.stamps[index].x < VIEW.width / 2 ? 'left' : 'right', after: screen.log.indexOf(`image:${index}`) > plate }));
    };
    const dropping = [rolling(907, 30, 0.1), rolling(906, 48, 0.5)];
    const abreast = [rolling(909, 30, 0.3), rolling(908, 48, 0.3, 1)];
    for (const pair of [dropping, abreast]) {
      for (const falling of [pair, [...pair].reverse()]) {
        const order = drawn(falling);
        expect(order.map((one) => one.after)).toEqual([true, true]);
        expect(order[1].x).toBe('right');
      }
    }
  });
});

describe('the feed arms on the canvas', () => {
  const near = (points: { x: number; y: number }[], x: number, y: number, within = 1e-6) => points.some((point) => Math.hypot(point.x - x, point.y - y) < within);
  /** A place across the field, as the share of its width that `x` is of a hundred. */
  const across = (x: number): number => (x * FIELD.width) / 100;
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
    for (const aim of [AIM.min, across(20), across(49), across(50), across(63), AIM.max]) {
      const machine = createMachine(3);
      point(machine, aim);
      expect(machine.tips).toEqual(aim < FIELD.width / 2 ? [aim, armStart(1)] : [armStart(0), aim]);
      const { lines, starts } = frame(machine);
      for (const arm of [0, 1] as const) expect(endsAt([...starts, ...lines], arm, machine.tips[arm])).toBe(true);
    }
  });

  it('draws a medal on a rail where it has rolled to, on its edge and leaning back, its face turned to the middle', () => {
    fakeDocument();
    for (const [aim, arm] of [[across(30), 0], [across(70), 1]] as const) {
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
    for (const [aim, arm] of [[across(40), 0], [across(60), 1]] as const) {
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
      dropAt(machine, across(40));
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
    for (const [aim, arm] of [[across(30), 0], [across(70), 1]] as const) {
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
      // On a phone the mouth is a dozen pixels wide and twenty tall; before, it was a slit of five.
      expect(wide * PHONE).toBeGreaterThan(12);
      expect(tall * PHONE).toBeGreaterThan(20);
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
    expect(left).toBeLessThan(ARM_REACH[0].max - 12);
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
    expect(machine.tips[0]).toBeLessThan(ARM_REACH[0].max - 30);
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
    dropAt(machine, across(45));
    step(machine, FEED.slot + 0.3);
    aimBoth(machine, across(58));
    step(machine, 0.1);
    expect(machine.tips).toEqual([across(58), across(58)]);
    const spot = rollingSpot(0, across(58), machine.rolling[0].remaining);
    expect(stampAt(frame(machine).stamps, spot.x, spot.height, spot.depth).off).toBeLessThan(1e-6);
  });

  it('shows under each arm’s tip how far from it a medal can land, when it is asked to', () => {
    fakeDocument();
    const machine = createMachine(3);
    point(machine, across(40));
    // A guide hangs from the foot of a medal at each tip, out over the pusher where the tip is: one for the left
    // arm, which has been pointed, and one for the right, which is where a new machine has it.
    const apex = project(across(40), ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const other = project(armStart(1), ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const shown = frame(machine, true).starts;
    expect(near(shown, apex.x, apex.y)).toBe(true);
    expect(near(shown, other.x, other.y)).toBe(true);
    const hidden = frame(machine, false).starts;
    expect(near(hidden, apex.x, apex.y)).toBe(false);
    expect(near(hidden, other.x, other.y)).toBe(false);
    // Each hangs under its own arm's tip, so while an arm is still on its way to an aim that has jumped, its guide
    // is where a medal leaving it now would be let go, not where the aim is. The other arm's guide has not moved.
    aimSide(machine, across(85));
    step(machine, 1 / 60);
    const [left, right] = machine.tips;
    expect(left).toBe(across(40));
    expect(right).toBeLessThan(across(85));
    const swinging = project(right, ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const there = project(across(85), ARMS.tip - MEDAL_RADIUS, ARMS.depth);
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
  const jewel = (id: number, x: number, y: number, level: 0 | 1, more: Partial<Medal> = {}): Medal => ({ id, x, y, level, tier: 0, sinceDrop: -1, stack: 1, ball: false, grown: 1, jewel: true, ...more });
  const plain = (id: number, x: number, y: number): Medal => ({ id, x, y, level: 0, tier: 0, sinceDrop: -1, stack: 1, ball: false, grown: 1 });
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
      const { screen, stage } = frame([stone, plain(9, 20, 60)], { calm: true });
      const spot = lyingJewel(stone);
      expect(stoneDrawn(screen, spot)).toBe(true);
      // The one medal is stamped, and nothing is stamped for the jewel: it is not a medal's face, nor a ball.
      expect(screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement))).toHaveLength(1);
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
    expect(stoneDrawn(bare.screen, lyingJewel(jewel(7, 40, 70, 0)), false)).toBe(false);
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
    expect(screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement) || stamp.image === stage.ball)).toHaveLength(0);
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
    const front = gone(jewel(7, 30, D + 0.1, 0));
    expect(front.exits).toEqual([{ id: 7, x: 30, y: D + 0.1, kind: 'won', side: -1, ball: false, jewel: true, age: 0 }]);
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
    // The arrows down into the tray keep clear of it: none is drawn where the plate is. There is one to either side of
    // it, in the tray's stretch of the front, and none under the corners, which are the side holes' mouths.
    const starts = made.flatMap((canvas) => canvas.starts);
    const arrowsOn = (from: number, to: number) => starts.filter((point) => Math.abs(point.y - project(FIELD.width / 2, -7.5, D).y) < 0.5 && point.x > project(from, -7.5, D).x && point.x < project(to, -7.5, D).x).length;
    expect(arrowsOn(JEWEL_PLATE.from, JEWEL_PLATE.to)).toBe(0);
    expect(arrowsOn(TRAY.from, JEWEL_PLATE.from)).toBe(1);
    expect(arrowsOn(JEWEL_PLATE.to, TRAY.to)).toBe(1);
    expect(arrowsOn(0, TRAY.from)).toBe(0);
    expect(arrowsOn(TRAY.to, FIELD.width)).toBe(0);
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

describe('the medals pouring out of the hopper on the canvas', () => {
  /** How high the middle of a medal is once it is down on the pusher, which is where the picture has a poured medal come to rest. */
  const REST = HEIGHT.pusher + HEIGHT.medal * 2 + RIDE * 0.5;

  it('stamps each poured medal with the face of its own tone, as it does every other medal in the air', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(7);
    queuePayout(machine, 90);
    for (let i = 0; i < 3000 && !(machine.hopper.phase === 'pouring' && machine.hopper.poured >= 30); i++) step(machine, 1 / 60);
    expect(machine.hopper.phase).toBe('pouring');
    // Nothing on the field but what is pouring, so that every medal's face on the picture is a poured medal's.
    machine.medals = [];
    machine.rolling = [];
    machine.falling = machine.falling.filter((medal) => medal.source === 'pour');
    const shown = machine.falling.filter((medal) => pourPose(medal, REST).shown > 0);
    expect(shown.length).toBeGreaterThan(10);
    const screen = recorder();
    drawField(screen.context, stage, machine, { showGuide: false });
    const faces = screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement));
    expect(faces).toHaveLength(shown.length);
    for (const medal of shown) {
      const pose = pourPose(medal, REST);
      const point = project(pose.x, pose.height, pose.depth);
      const stamped = faces.filter((stamp) => Math.hypot(stamp.x - point.x, stamp.y - point.y) < 1e-6);
      expect(stamped).toHaveLength(1);
      // Its own face, by its id, and not the one face the stage keeps for a medal it knows nothing of.
      expect(stamped[0].image).toBe(stage.faces[faceOf(medal.id)]);
      expect(stamped[0].alpha).toBeCloseTo(pose.shown, 9);
    }
    // So they are not all of one tone, any more than the medals lying on the table are.
    expect(new Set(shown.map((medal) => faceOf(medal.id))).size).toBeGreaterThan(1);
    expect(new Set(faces.map((stamp) => stamp.image)).size).toBe(new Set(shown.map((medal) => faceOf(medal.id))).size);
    expect(stage.medal).toBe(stage.faces[0]);
  });
});

describe('a tower on the canvas', () => {
  const P = HEIGHT.pusher;
  const T = HEIGHT.medal;
  /** One frame of a field with nothing on it but a tower of `stack` medals in the middle of the pusher, and where the tower is. */
  const frame = (stack: number) => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    const depth = pusherFront(machine.time) - 12;
    machine.medals = [{ id: 900, x: FIELD.width / 2, y: depth, level: 1, tier: 0, sinceDrop: -1, stack, ball: false, grown: 1 }];
    const screen = recorder();
    drawField(screen.context, stage, machine, { showGuide: false, calm: true });
    return { screen, stage, depth };
  };

  it('stands as tall as its medals are thick, with a line between one medal and the next that is thinner than a medal', () => {
    for (const stack of [3, 12, TOWER.max]) {
      const { screen, stage, depth } = frame(stack);
      const foot = project(FIELD.width / 2, P + T, depth);
      const head = project(FIELD.width / 2, P + stack * T, depth);
      // Its top medal's face is where the top of a column of that many medals is, and nothing is stamped higher.
      const faces = screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement) || stamp.image === stage.medal);
      expect(faces.filter((stamp) => Math.hypot(stamp.x - head.x, stamp.y - head.y) < 1e-6)).toHaveLength(1);
      expect(Math.min(...faces.map((stamp) => stamp.y))).toBeCloseTo(head.y, 6);
      // The lines are the near halves of ovals up the column, one stroke: one for every medal but the lowest and the top one.
      const drawn = screen.strokes.filter((stroke) => stroke.arcs.length > 0 && stroke.arcs.every((arc) => arc.from === 0 && arc.to === Math.PI && Math.abs(arc.x - foot.x) < 1e-6 && arc.y < foot.y && arc.y > head.y));
      expect(drawn).toHaveLength(1);
      const [{ width, arcs }] = drawn;
      expect(arcs).toHaveLength(stack - 2);
      // A medal's thickness apart, as the camera sees it there: half as far as when a medal was twice as thick.
      const apart = (foot.y - head.y) / (stack - 1);
      arcs.forEach((arc, index) => expect(arc.y).toBeCloseTo(foot.y - apart * (index + 1), 6));
      const one = foot.y - project(FIELD.width / 2, P + T * 2, depth).y;
      expect(apart).toBeGreaterThan(one * 0.999);
      expect(apart).toBeLessThan(one * 1.1);
      expect(one).toBeGreaterThan(T * rise(foot));
      // And each line is a good deal thinner than the medal it marks off, so the column is brass with lines in it.
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(1);
      expect(width).toBeLessThan(one * 0.4);
    }
  });

  it('is drawn whole on an arm as standing free, its lowest medal and its top one', () => {
    for (const armed of [false, true]) {
      fakeDocument();
      const stage = createStage(1);
      const machine = createMachine(3);
      const depth = pusherFront(machine.time) - 12;
      machine.medals = [{ id: 900, x: FIELD.width / 2, y: depth, level: 1, tier: 0, sinceDrop: -1, stack: 30, ball: false, grown: 1 }];
      // The medals on the pusher are drawn without a tower an arm is pushing, which is drawn with its arm.
      if (armed) machine.stacker.tubes[0] = { ...idleTube(), phase: 'pushing', clock: STACK.pushes * 0.6, tower: 900 };
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false, calm: true });
      const faces = screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement) || stamp.image === stage.medal);
      for (const height of [P + T, P + 30 * T]) {
        const at = project(FIELD.width / 2, height, depth);
        expect(faces.filter((stamp) => Math.hypot(stamp.x - at.x, stamp.y - at.y) < 1e-6), `${armed ? 'on an arm' : 'free'}, at ${height}`).toHaveLength(1);
      }
    }
  });

  it('stands four and a half medals’ widths high at its tallest, as tall as a tower can stand under the feed arms', () => {
    expect(TOWER.max * T).toBeGreaterThan(MEDAL_RADIUS * 2 * 4.4);
    expect(TOWER.max * T).toBeLessThan(MEDAL_RADIUS * 2 * 4.7);
    // And on a phone, where the stage is 345 pixels wide, that is a column some forty pixels high: plainly a tower over a pile two deep.
    const depth = pusherFront(0) - 12;
    const tall = (project(FIELD.width / 2, P + T, depth).y - project(FIELD.width / 2, P + TOWER.max * T, depth).y) * (345 / VIEW.width);
    expect(tall).toBeGreaterThan(36);
    expect(tall).toBeGreaterThan(10 * (project(FIELD.width / 2, P, depth).y - project(FIELD.width / 2, P + T * 2, depth).y) * (345 / VIEW.width));
  });
});

describe('what the cabinet says when a medal drops into a START slot', () => {
  const FRAME = 1 / 60;
  const time = 1.5;
  const plain: Entry = { gate: 1, held: true, gold: false, lucky: false };
  const lucky: Entry = { gate: 0, held: true, gold: false, lucky: true };
  const gilding: Entry = { gate: 2, held: false, gold: true, lucky: false };
  const wasted: Entry = { gate: 1, held: false, gold: false, lucky: false };
  /** Where a lamp of the hold is on the drawing, from the left. */
  const lampAt = (lamp: number) => project(HOLD_LAMPS.first + HOLD_LAMPS.step * lamp, (HOUSING.shelf + SCREEN.foot) / 2, HOUSING.ledge);
  /** The words that stand over the slots: popups that are words. */
  const words = (stage: Stage) => stage.popups.filter((popup) => popup.word);

  it('has a lamp in the hold for every spin the machine can hold', () => {
    fakeDocument();
    expect(HOLD_COUNT).toBe(MAX_STOCK);
    expect(createStage(1).holdGlow).toEqual(Array.from({ length: MAX_STOCK }, () => 0));
  });

  it('says all of it in the frame the medal drops, which is the frame the machine takes it in: the slot bursts with light, a word stands over it, and a spark runs up to the hold and lights the lamp the spin is held as', () => {
    fakeDocument();
    const stage = createStage(1);
    // The machine held two spins and has just taken a third, whose medal has dropped into its slot.
    enterGate(stage, plain);
    expect(stage.entries).toHaveLength(1);
    expect(stage.entries[0]).toMatchObject({ dropped: false, run: -1 });
    // Until the cabinet has answered it, nothing is lit, nothing is said and nothing flies, and the hold shows two.
    expect(stage.gateGlow).toEqual([0, 0, 0]);
    expect([stage.sparks.length, words(stage).length]).toEqual([0, 0]);
    expect(holdShown(stage, 3, 0)).toEqual({ stock: 2, gold: 0, taken: 0, gilt: 0 });
    const dropped = dropEntries(stage, time);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject(plain);
    // It is answered once: asked again in the same frame, or the next, the cabinet has nothing new to say.
    expect(dropEntries(stage, time)).toEqual([]);
    // All at once. The slot is lit as a slot a medal has gone down is, and throws its sparks.
    expect(stage.gateGlow).toEqual([0, GLOW_TIME, 0]);
    expect(stage.sparks).toHaveLength(BURST.sparks);
    const mouth = mouthOnDrawing(1, time);
    for (const spark of stage.sparks) {
      expect(spark.x).toBeCloseTo(mouth.x, 6);
      // Upward, in a fan: none of them goes down.
      expect(spark.vy).toBeLessThan(0);
    }
    expect(new Set(stage.sparks.map((spark) => Math.sign(spark.vx))).size).toBe(2);
    // The word, over the slot.
    const [word] = words(stage);
    expect(word).toMatchObject({ text: ENTRY_WORDS.start, color: ENTRY_INK.start, age: 0, word: { size: BURST.plain, still: false } });
    expect(word.x).toBeCloseTo(mouth.x, 6);
    expect(word.y).toBeLessThan(mouth.y);
    expect(mouth.y - word.y).toBeLessThan(40);
    // And the spark has set out from the slot. The lamp is not lit yet: the hold still shows two.
    expect(stage.entries[0]).toMatchObject({ dropped: true, run: 0, lamp: true });
    expect(stage.entries[0].from.x).toBeCloseTo(mouth.x, 6);
    expect(holdShown(stage, 3, 0)).toMatchObject({ stock: 2 });
    expect(lampFor(stage, stage.entries[0])).toBe(2);
    expect(stage.holdGlow.every((glow) => glow === 0)).toBe(true);
    // It flies to the third lamp, nearer in every frame, drawn on the glass with a tail behind it.
    const lamp = lampAt(2);
    let away = Infinity;
    let flown = 0;
    while (stage.entries.length > 0) {
      const glass = recorder();
      drawOverlay(glass.context, stage);
      const head = glass.fills.filter((fill) => fill.style === '#ffffff' && fill.rounds.length === 1 && fill.points.length === 0).map((fill) => fill.rounds[0]);
      expect(head).toHaveLength(1);
      const left = Math.hypot(head[0].x - lamp.x, head[0].y - lamp.y);
      expect(left).toBeLessThan(away + 1e-9);
      away = left;
      // Its tail is a line from behind it up to it.
      expect(glass.lines.some((point) => Math.hypot(point.x - head[0].x, point.y - head[0].y) < 1e-6)).toBe(true);
      // The word is up meanwhile.
      expect(glass.texts.map((entry) => entry.text)).toContain(ENTRY_WORDS.start);
      ageStage(stage, FRAME);
      flown++;
      expect(flown).toBeLessThan(60);
    }
    expect(Math.abs(flown * FRAME - BURST.run)).toBeLessThan(FRAME + 1e-9);
    expect(away).toBeLessThan(30);
    // It is there: that lamp shines, and no other, and from now on the hold shows the spin.
    expect(stage.holdGlow.map((glow) => glow > 0)).toEqual([false, false, true, false, false, false, false, false]);
    expect(holdShown(stage, 3, 0)).toMatchObject({ stock: 3, gold: 0 });
    // The word outlasts the spark and is gone a moment later; the lamp's shine fades.
    expect(words(stage)).toHaveLength(1);
    for (let i = 0; i < 60; i++) ageStage(stage, FRAME);
    expect(words(stage)).toHaveLength(0);
    expect(stage.holdGlow.every((glow) => glow === 0)).toBe(true);
    expect(BURST.word).toBeGreaterThan(BURST.run * 2);
  });

  it('draws the lamp a spark gets to lit in the frame it gets there, under its shine, and keeps the count the sparks were bound by', () => {
    fakeDocument();
    const stage = createStage(1);
    // The machine held two spins and has just taken a third; its spark sets out for the third lamp.
    enterGate(stage, plain);
    holdShown(stage, 3, 0);
    dropEntries(stage, time);
    while (stage.entries[0].run + FRAME < BURST.run) ageStage(stage, FRAME);
    // The frame before it gets there, the hold shows two and the third lamp is dark.
    expect(holdShown(stage, 3, 0)).toMatchObject({ stock: 2 });
    expect(stage.holdGlow[2]).toBe(0);
    ageStage(stage, FRAME);
    // In the frame it gets there, the lamp shines, and the count the lamps are drawn by has it lit under the shine.
    expect(stage.entries).toHaveLength(0);
    expect(stage.holdGlow[2]).toBeGreaterThan(0);
    expect(holdCount(stage, 3, 0)).toEqual({ stock: 3, gold: 0, taken: 0, gilt: 0 });
    // The stage is not told it: it keeps the count it bound the sparks by until it is asked again.
    expect(stage.hold).toMatchObject({ stock: 2 });
  });

  it('tells a gold spin from an everyday one, a held spin turned gold from both, and a medal that started nothing from them all', () => {
    fakeDocument();
    // A medal through the lit slot: its spin is gold from the start. The word is gold and bigger, there are more sparks, and its spark is bound for the first lamp that is not gold.
    const golden = createStage(1);
    enterGate(golden, lucky);
    expect(holdShown(golden, 4, 2)).toEqual({ stock: 3, gold: 1, taken: 0, gilt: 0 });
    expect(dropEntries(golden, time)[0]).toMatchObject(lucky);
    expect(words(golden)[0]).toMatchObject({ text: ENTRY_WORDS.start, color: ENTRY_INK.gold, word: { size: BURST.big } });
    expect(BURST.big).toBeGreaterThan(BURST.plain * 1.25);
    expect(golden.sparks).toHaveLength(BURST.gold);
    expect(BURST.gold).toBeGreaterThan(BURST.sparks);
    expect(golden.gateGlow[0]).toBe(GLOW_TIME);
    expect(lampFor(golden, golden.entries[0])).toBe(1);
    while (golden.entries.length > 0) ageStage(golden, FRAME);
    expect(golden.holdGlow.findIndex((glow) => glow > 0)).toBe(1);
    expect(holdShown(golden, 4, 2)).toMatchObject({ stock: 4, gold: 2 });

    // A medal that found the hold full and turned a held spin gold: another word, gold too, and its spark turns that lamp.
    const gilt = createStage(1);
    enterGate(gilt, gilding);
    expect(holdShown(gilt, MAX_STOCK, 3)).toEqual({ stock: MAX_STOCK, gold: 2, taken: 0, gilt: 0 });
    dropEntries(gilt, time);
    expect(words(gilt)[0]).toMatchObject({ text: ENTRY_WORDS.gold, color: ENTRY_INK.gold, word: { size: BURST.big } });
    expect(gilt.sparks).toHaveLength(BURST.gold);
    expect(lampFor(gilt, gilt.entries[0])).toBe(2);
    while (gilt.entries.length > 0) ageStage(gilt, FRAME);
    expect(gilt.holdGlow.findIndex((glow) => glow > 0)).toBe(2);
    expect(holdShown(gilt, MAX_STOCK, 3)).toMatchObject({ stock: MAX_STOCK, gold: 3 });

    // A medal that found the hold full and every spin in it gold: a dull word, smaller, and nothing else. The slot does not burst, nothing flies, no lamp shines.
    const full = createStage(1);
    enterGate(full, wasted);
    expect(holdShown(full, MAX_STOCK, MAX_STOCK)).toEqual({ stock: MAX_STOCK, gold: MAX_STOCK, taken: 0, gilt: 0 });
    expect(dropEntries(full, time)[0]).toMatchObject(wasted);
    expect(words(full)[0]).toMatchObject({ text: ENTRY_WORDS.full, color: ENTRY_INK.full, word: { size: BURST.dull } });
    expect(BURST.dull).toBeLessThan(BURST.plain);
    expect(full.gateGlow).toEqual([0, 0, 0]);
    expect(full.sparks).toHaveLength(0);
    expect(full.entries).toHaveLength(0);
    expect(full.holdGlow.every((glow) => glow === 0)).toBe(true);
    // The three words are three words, and the grey is not either gold.
    expect(new Set(Object.values(ENTRY_WORDS)).size).toBe(3);
    expect(new Set(Object.values(ENTRY_INK)).size).toBe(3);
  });

  it('flies nothing where nothing may move: the cabinet answers with the slot lit, the word standing still and the lamp lit, all in the frame the machine took the medal', () => {
    fakeDocument();
    const stage = createStage(1);
    enterGate(stage, plain);
    holdShown(stage, 1, 0);
    // There the machine takes a medal as it comes over the lip (session.ts): it is not seen to ride.
    const dropped = dropEntries(stage, time, true);
    expect(dropped).toHaveLength(1);
    expect(stage.gateGlow[1]).toBe(GLOW_TIME);
    expect(stage.sparks).toHaveLength(0);
    expect(words(stage)[0]).toMatchObject({ text: ENTRY_WORDS.start, word: { size: BURST.plain, still: true } });
    // No spark sets out: the lamp shines at once, and the hold shows the spin.
    expect(stage.entries).toHaveLength(0);
    expect(stage.holdGlow.map((glow) => glow > 0)).toEqual([true, false, false, false, false, false, false, false]);
    expect(holdShown(stage, 1, 0)).toMatchObject({ stock: 1 });
    // The word stands where it was put and is the size it was given, for as long as it is up.
    const [word] = words(stage);
    const drawn: { y: number; tall: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const glass = recorder();
      drawOverlay(glass.context, stage, true);
      const [text] = glass.texts.filter((entry) => entry.text === ENTRY_WORDS.start);
      drawn.push({ y: text.y, tall: text.tall });
      ageStage(stage, FRAME, true);
    }
    expect(new Set(drawn.map((entry) => entry.y))).toEqual(new Set([word.y]));
    // With motion a word pops: it is drawn a little too big at first, and rises as it stands.
    const lively = createStage(1);
    enterGate(lively, plain);
    dropEntries(lively, time);
    const heights: number[] = [];
    for (let i = 0; i < 20; i++) {
      const glass = recorder();
      drawOverlay(glass.context, lively);
      heights.push(glass.texts.filter((entry) => entry.text === ENTRY_WORDS.start)[0].y);
      ageStage(lively, FRAME);
    }
    expect(heights[19]).toBeLessThan(heights[0] - 2);
  });

  it('lights no lamp where nothing may move either, for a spin the screen took in the step the machine took its medal', () => {
    fakeDocument();
    const stage = createStage(1);
    // As the cabinet does it in one frame: the medal is noted, the stage is told the machine holds nothing, and the medal is answered.
    enterGate(stage, plain);
    expect(holdShown(stage, 0, 0)).toMatchObject({ stock: 0, taken: 1 });
    expect(dropEntries(stage, time, true)).toHaveLength(1);
    expect(stage.gateGlow[1]).toBe(GLOW_TIME);
    expect(words(stage)).toHaveLength(1);
    expect(stage.entries).toHaveLength(0);
    expect(stage.holdGlow.every((glow) => glow === 0)).toBe(true);
    expect(holdShown(stage, 0, 0)).toEqual({ stock: 0, gold: 0, taken: 0, gilt: 0 });
  });

  it('sends no spark for a spin the screen has taken already: a medal that finds the screen free starts its spin as it drops, and that spin is never a lamp', () => {
    fakeDocument();
    const stage = createStage(1);
    enterGate(stage, plain);
    // The machine holds nothing: the spin this medal held is on the screen, started in the step the medal dropped.
    expect(holdShown(stage, 0, 0)).toEqual({ stock: 0, gold: 0, taken: 1, gilt: 0 });
    const [answered] = dropEntries(stage, time);
    expect(answered).toMatchObject({ ...plain, run: -1, lamp: false });
    // The slot bursts and the word stands over it all the same; but nothing sets out for the hold, and no lamp shines.
    expect(stage.gateGlow[1]).toBe(GLOW_TIME);
    expect(words(stage)[0]).toMatchObject({ text: ENTRY_WORDS.start });
    expect(stage.sparks).toHaveLength(BURST.sparks);
    expect(stage.entries).toHaveLength(0);
    for (let i = 0; i < 40; i++) ageStage(stage, FRAME);
    expect(stage.holdGlow.every((glow) => glow === 0)).toBe(true);
    expect(holdShown(stage, 0, 0)).toEqual({ stock: 0, gold: 0, taken: 0, gilt: 0 });
  });

  it('has a slot say one thing at a time: the word of a medal that went down it a moment ago gives way to the next one’s, and another slot’s word is left standing', () => {
    fakeDocument();
    const stage = createStage(1);
    holdShown(stage, MAX_STOCK, MAX_STOCK);
    // Three medals find the hold full, two of them down the same slot a few frames apart.
    for (const entry of [wasted, { ...wasted, gate: 2 }, wasted]) {
      enterGate(stage, entry);
      dropEntries(stage, time);
      for (let i = 0; i < 6; i++) ageStage(stage, FRAME);
    }
    const up = words(stage);
    expect(up.map((popup) => [popup.text, popup.word?.gate])).toEqual([
      [ENTRY_WORDS.full, 2],
      [ENTRY_WORDS.full, 1],
    ]);
    // The one that stands over the slot two medals went down is the second medal's: the younger of the two that are up.
    expect(up[1].age).toBeLessThan(up[0].age);
  });

  it('counts medals that go down one slot in a row, each before the last one’s word is gone: START! ×2, ×3, and starts again once the word has gone', () => {
    fakeDocument();
    const stage = createStage(1);
    const drop = (entry: Entry, frames: number): void => {
      enterGate(stage, entry);
      holdShown(stage, 0, 0);
      dropEntries(stage, time);
      for (let i = 0; i < frames; i++) ageStage(stage, FRAME);
    };
    // Three everyday medals down the middle slot a few frames apart, and one down the left slot between them.
    drop(plain, 6);
    drop({ ...plain, gate: 0 }, 6);
    drop(plain, 6);
    drop(plain, 0);
    const said = () => words(stage).map((popup) => [popup.text, popup.word?.gate, popup.word?.times]);
    expect(said()).toEqual([
      [ENTRY_WORDS.start, 0, 1],
      [`${ENTRY_WORDS.start} ×3`, 1, 3],
    ]);
    // One through the lit slot after them starts a spin too, a gold one: it is the fourth, and the word turns gold.
    drop({ ...lucky, gate: 1 }, 0);
    expect(words(stage).find((popup) => popup.word?.gate === 1)).toMatchObject({ text: `${ENTRY_WORDS.start} ×4`, color: ENTRY_INK.gold, word: { times: 4 } });
    expect(entryTimes(ENTRY_WORDS.gold, 2)).toBe('GOLD! ×2');
    expect(entryTimes(ENTRY_WORDS.start, 1)).toBe(ENTRY_WORDS.start);
    // Once the word has gone, the next medal down that slot is one again.
    for (let i = 0; i < Math.ceil(BURST.word / FRAME) + 1; i++) ageStage(stage, FRAME);
    drop(plain, 0);
    expect(words(stage).find((popup) => popup.word?.gate === 1)).toMatchObject({ text: ENTRY_WORDS.start, word: { times: 1 } });
  });

  it('sends each of several medals’ sparks to its own lamp, in the order they dropped, and never past the last lamp', () => {
    fakeDocument();
    const stage = createStage(1);
    // The machine held one spin; then an everyday medal, a lucky one and another everyday one dropped in, a few frames apart.
    for (const entry of [plain, lucky, { ...plain, gate: 2 }]) {
      enterGate(stage, entry);
      holdShown(stage, 4, 1);
      expect(dropEntries(stage, time)).toMatchObject([{ ...entry, run: 0, lamp: true }]);
      for (let i = 0; i < 4; i++) ageStage(stage, FRAME);
    }
    expect(holdShown(stage, 4, 1)).toEqual({ stock: 1, gold: 0, taken: 0, gilt: 0 });
    const [first, second, third] = stage.entries;
    // The first takes the lamp after the one that is lit. The gold one takes the first lamp, where the gold spins are, and pushes the rest along; so the third takes the fourth.
    expect([lampFor(stage, first), lampFor(stage, second), lampFor(stage, third)]).toEqual([1, 0, 3]);
    // With the hold all but full, a spark is still bound for a lamp there is.
    holdShown(stage, MAX_STOCK + 2, 0);
    stage.hold = { stock: MAX_STOCK - 1, gold: 0, taken: 0, gilt: 0 };
    expect(lampFor(stage, third)).toBe(MAX_STOCK - 1);
    // A slot the stage has no such thing as is not noted.
    enterGate(stage, { ...plain, gate: 7 });
    enterGate(stage, { ...plain, gate: -1 });
    expect(stage.entries).toHaveLength(3);
  });

  it('agrees with the machine over a minute of both rails held: every medal it takes is answered in the frame it drops, the lamps never show more than it holds, and show all of it once every spark is in', { timeout: 30_000 }, () => {
    fakeDocument();
    const stage = createStage(1);
    const session = createSession(11, { quickPick: true });
    session.credits = 1e6;
    const events: SessionEvent[] = [];
    let rode = 0;
    let counted = 0;
    let dropped = 0;
    let settled = 0;
    let sparks = 0;
    for (let frame = 0; frame < 60 * 60; frame++) {
      insert(session, 0);
      insert(session, 1);
      events.length = 0;
      advance(session, FRAME, events);
      // As the cabinet does it: what dropped into a slot in this frame is noted, and answered once the stage knows what the machine holds.
      let fallen = 0;
      for (const event of events) {
        if (event.type === 'riding') rode++;
        if (event.type !== 'checker') continue;
        fallen++;
        enterGate(stage, event);
      }
      counted += fallen;
      holdShown(stage, session.stock, session.gold);
      const fell = dropEntries(stage, session.machine.time);
      expect(fell).toHaveLength(fallen);
      dropped += fell.length;
      sparks += fell.filter((entry) => entry.run === 0).length;
      // Nothing is left waiting for its answer: what is still on the stage is a spark on its way.
      for (const entry of stage.entries) expect([entry.dropped, entry.run >= 0]).toEqual([true, true]);
      const hold = holdShown(stage, session.stock, session.gold);
      expect(hold.stock).toBeGreaterThanOrEqual(0);
      expect(hold.stock).toBeLessThanOrEqual(session.stock);
      expect(hold.gold).toBeLessThanOrEqual(Math.min(hold.stock, session.gold));
      expect(hold.taken + hold.gilt).toBeLessThanOrEqual(stage.entries.length * 2);
      if (stage.entries.length === 0) {
        expect([hold.stock, hold.gold, hold.taken, hold.gilt]).toEqual([session.stock, session.gold, 0, 0]);
        settled++;
      }
      for (const entry of stage.entries) if (entry.run >= 0) expect(lampFor(stage, entry)).toBeLessThan(HOLD_COUNT);
      ageStage(stage, FRAME);
    }
    // Plenty of medals went in, each was answered once, and the cabinet was often at rest with nothing on its way.
    expect(counted).toBeGreaterThan(30);
    expect(dropped).toBe(counted);
    // Every medal the lip's rule counted has dropped, or is on its tongue still; and the machine has counted the ones that dropped.
    expect(rode).toBe(counted + session.riding.length);
    expect(session.hits).toBe(counted);
    expect(settled).toBeGreaterThan(600);
    // Most of them lit a lamp by a spark; the rest found the screen free, or the hold full.
    expect(sparks).toBeGreaterThan(10);
    expect(sparks).toBeLessThanOrEqual(dropped);
  });

  it('draws the lamp a spark has just reached white hot, with a wide bloom round it, whether or not its spin is still held', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    const hot = 2;
    stage.holdGlow[hot] = GLOW_TIME;
    const screen = recorder();
    // The hold shows one spin: the lamp that shines is not one of the lit ones.
    drawField(screen.context, stage, machine, { showGuide: false, stock: 1 });
    const circles = (lamp: number) => {
      const at = lampAt(lamp);
      return screen.fills.filter((fill) => fill.points.length === 0 && fill.rounds.length === 1 && Math.hypot(fill.rounds[0].x - at.x, fill.rounds[0].y - at.y) < 1e-6);
    };
    for (let lamp = 0; lamp < HOLD_COUNT; lamp++) {
      const white = circles(lamp).filter((fill) => fill.style === 'rgba(255, 255, 255, 1)');
      const bloom = circles(lamp).filter((fill) => fill.style === 'rgba(255, 251, 224, 0.5)');
      expect([white.length, bloom.length]).toEqual(lamp === hot ? [1, 1] : [0, 0]);
      if (lamp !== hot) continue;
      // Over its own body, and a good deal wider than a lit lamp's glow.
      const body = HOLD_LAMPS.radius * lampAt(lamp).scale;
      expect(white[0].rounds[0].r).toBeGreaterThan(body);
      expect(bloom[0].rounds[0].r).toBeGreaterThan(body * 4);
    }
    // As the shine fades, so does the lamp, and then it is drawn as it was.
    ageStage(stage, GLOW_TIME / 2);
    const fading = recorder();
    drawField(fading.context, stage, machine, { showGuide: false, stock: 1 });
    expect(fading.fills.some((fill) => fill.style === 'rgba(255, 255, 255, 0.5)')).toBe(true);
    ageStage(stage, GLOW_TIME);
    const after = recorder();
    drawField(after.context, stage, machine, { showGuide: false, stock: 1 });
    expect(after.fills.some((fill) => fill.style.startsWith('rgba(255, 255, 255, '))).toBe(false);
  });
});

describe('the side holes on the canvas', () => {
  const D = FIELD.depth;
  const W = FIELD.width;
  const T = HEIGHT.medal;
  const SIDES = [-1, 1] as const;
  const near = (points: { x: number; y: number }[], at: { x: number; y: number }, within = 1e-6) => points.some((point) => Math.hypot(point.x - at.x, point.y - at.y) < within);
  /** The outlines that go through every one of these places of the cabinet, among some that were filled. */
  const through = (fills: Fill[], corners: [number, number, number][]) => fills.filter((fill) => corners.every(([x, height, depth]) => near(fill.points, project(x, height, depth))));
  /** A side hole's mouth, across: its side of the table, the face of its cheek, and the cheek's face on the tray's side. */
  const ends = (side: number) => ({ from: side < 0 ? 0 : W, hole: acrossAt(SIDE_HOLE.reach - SIDE_HOLE.cheek, side), tray: acrossAt(SIDE_HOLE.reach + SIDE_HOLE.cheek, side) });
  /** One frame of an empty field with these on their way out of it, and what it drew. */
  const frame = (exits: ExitingMedal[], calm = false, stage: Stage = createStage(1)) => {
    stage.exits.push(...exits);
    const machine = createMachine(3);
    machine.medals = [];
    machine.time = 1.5;
    const screen = recorder();
    drawField(screen.context, stage, machine, { showGuide: false, calm });
    return { screen, stage };
  };
  /** Where in the order of a frame the first bar of a side's ball rail was laid, by its two ends. */
  const railLaid = (screen: Recorder, side: number): number => {
    const out = SIDE_HOLE.rails[0];
    const to = project(ends(side).hole, railTop(SIDE_HOLE.reach) - SIDE_HOLE.bar / 2, D + out);
    return screen.log.findIndex((entry) => entry.startsWith('line:') && entry.endsWith(` ${to.x.toFixed(2)},${to.y.toFixed(2)}`));
  };

  it('paints a dark mouth under each front corner once, with its chute, its arrows and its red edge, and the tray between two cheeks', () => {
    const made = fakeDocument();
    createStage(1);
    const fills = made.flatMap((canvas) => canvas.fills);
    const drawn = made.flatMap((canvas) => [...canvas.starts, ...canvas.lines]);
    const past = D + SIDE_HOLE.past;
    for (const side of SIDES) {
      const { from, hole, tray } = ends(side);
      // Black under the edge, which in this picture is the inside of a hole and nothing else.
      const [wall] = through(fills, [
        [from, 0, D],
        [hole, 0, D],
        [hole, holeFloor(0), D],
        [from, holeFloor(0), D],
      ]);
      expect(wall.style).toBe('#030104');
      // The chute in it: lit red where it comes out from under the edge, black where it goes out of sight.
      const [chute] = through(fills, [
        [from, holeFloor(0), D],
        [hole, holeFloor(0), D],
        [hole, holeFloor(SIDE_HOLE.past), past],
        [from, holeFloor(SIDE_HOLE.past), past],
      ]);
      expect(chute.stops).toEqual(['#7a1429', '#27080f', '#070205']);
      // An arrow at each mark, pointing away from the table: its barbs start nearer the edge than its point is.
      for (const mark of SIDE_HOLE.marks) {
        const x = acrossAt(mark, side);
        expect(near(drawn, project(x, holeFloor(SIDE_HOLE.far), D + SIDE_HOLE.far))).toBe(true);
        for (const end of [x - SIDE_HOLE.span / 2, x + SIDE_HOLE.span / 2]) expect(near(drawn, project(end, holeFloor(SIDE_HOLE.near), D + SIDE_HOLE.near))).toBe(true);
      }
      // The red edge runs along the front from the side of the table to the cheek, and the gold one does not come this far.
      expect(made.some((canvas) => canvas.log.includes(`line:${[project(from, 0, D), project(hole, 0, D)].map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}`))).toBe(true);
      // The cheek: its top, level with the table and out past the foot of the picture, in steel; and its face to the tray.
      const [top] = through(fills, [
        [hole, 0, D],
        [tray, 0, D],
        [tray, 0, past],
        [hole, 0, past],
      ]);
      expect(top.stops).toEqual(['#e4e8f4', '#8d97b8']);
      expect(project(hole, 0, past).y).toBeGreaterThan(VIEW.height);
      expect(
        through(fills, [
          [tray, 0, D],
          [tray, 0, past],
          [tray, -18, past],
          [tray, -18, D],
        ]),
      ).toHaveLength(1);
    }
    // The front of the table is the tray's between the cheeks and no wider: nothing is painted down the whole of it.
    expect(
      through(fills, [
        [TRAY.from, 0, D],
        [TRAY.to, 0, D],
        [TRAY.to, -18, D],
        [TRAY.from, -18, D],
      ]),
    ).toHaveLength(1);
    expect(fills.some((fill) => near(fill.points, project(0, -18, D)) || near(fill.points, project(W, -18, D)))).toBe(false);
    const gold = [project(TRAY.from, 0, D), project(TRAY.to, 0, D)].map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    expect(made.some((canvas) => canvas.log.includes(`line:${gold}`))).toBe(true);
    // The rails are not in this layer: every frame lays them, over whatever has gone down a mouth.
    expect(made.every((canvas) => railLaid(canvas, -1) < 0 && railLaid(canvas, 1) < 0)).toBe(true);
  });

  it('lights the tray between the cheeks only, and the whole of a hole a medal has gone down: its chute and its mouth', () => {
    fakeDocument();
    const lit = (stage: Stage) => frame([], true, stage).screen;
    const won = createStage(1);
    won.trayGlow = GLOW_TIME;
    const gold = lit(won).fills.filter((fill) => fill.style === 'rgba(255, 214, 92, 0.4)');
    expect(gold).toHaveLength(1);
    for (const x of [TRAY.from, TRAY.to]) for (const height of [0, -18]) expect(near(gold[0].points, project(x, height, D))).toBe(true);
    for (const index of [0, 1]) {
      const side = index === 0 ? -1 : 1;
      const lost = createStage(1);
      lost.sideGlow[index] = GLOW_TIME;
      const red = lit(lost).fills.filter((fill) => fill.style === 'rgba(255, 70, 96, 0.45)');
      // Two patches of the same light: the chute beside the open side, and the mouth round the corner from it.
      expect(red).toHaveLength(2);
      const { from, hole } = ends(side);
      expect(near(red[0].points, project(from, chuteHeight(0), FIELD.sideOpenFrom))).toBe(true);
      expect(near(red[1].points, project(from, holeFloor(0), D))).toBe(true);
      expect(near(red[1].points, project(hole, holeFloor(0), D))).toBe(true);
      // And nothing of the tray's.
      expect(lit(lost).fills.some((fill) => fill.style.startsWith('rgba(255, 214, 92, 0.4'))).toBe(false);
    }
    // With nothing lit there is neither.
    const dark = lit(createStage(1));
    expect(dark.fills.some((fill) => fill.style.startsWith('rgba(255, 70, 96,') || fill.style === 'rgba(255, 214, 92, 0.4)')).toBe(false);
  });

  it('lays the ball rail across each mouth in every frame, from the cabinet’s frame to the cheek, leaning toward the tray', () => {
    fakeDocument();
    for (const calm of [false, true]) {
      const { screen } = frame([], calm);
      for (const side of SIDES) {
        for (const out of SIDE_HOLE.rails) {
          const to = project(ends(side).hole, railTop(SIDE_HOLE.reach) - SIDE_HOLE.bar / 2, D + out);
          const laid = screen.log.filter((entry) => entry.startsWith('line:') && entry.endsWith(` ${to.x.toFixed(2)},${to.y.toFixed(2)}`));
          // Its shade and its body end here; the bright line along its top is a hair higher.
          expect(laid).toHaveLength(2);
          // It starts out past the side of the picture, higher than it ends: it leans toward the tray.
          const [x, y] = laid[0].slice(5).split(' ')[0].split(',').map(Number);
          expect(side < 0 ? x : VIEW.width - x).toBeLessThan(0);
          expect(y).toBeLessThan(to.y);
        }
      }
    }
  });

  it('stamps a medal that drops into a mouth where the hole has it, fading into the dark, and lays the rail over it', () => {
    fakeDocument();
    for (const side of SIDES) {
      for (const age of [0.02, 0.1, 0.2, 0.3, 0.4]) {
        const x = acrossAt(9, side);
        const { screen, stage } = frame([{ id: 5, x, y: D + 0.1, kind: 'lost', side, ball: false, corner: true, age }]);
        const medals = screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement));
        expect(medals).toHaveLength(1);
        const sunk = sinking(x, D + 0.1, side, age, T);
        const at = project(sunk.x, sunk.height + T / 2, sunk.depth);
        expect(medals[0].x).toBeCloseTo(at.x, 6);
        expect(medals[0].y).toBeCloseTo(at.y, 6);
        // It goes dark as one that goes down the side's chute does, and it is gone before a medal's moment is up.
        expect(medals[0].alpha).toBeCloseTo(Math.max(0, 1 - (age / (EXIT_TIME * 0.7)) ** 2), 9);
        // The further it has tipped, nose toward the player, the more of its face is seen: it is never a sliver.
        expect(medals[0].height / medals[0].width).toBeGreaterThanOrEqual(at.tilt - 1e-9);
        // The rail is laid after it: the medal is seen through the bars.
        const stamped = screen.log.indexOf(`image:${screen.stamps.indexOf(medals[0])}`);
        expect(stamped).toBeGreaterThanOrEqual(0);
        expect(railLaid(screen, side)).toBeGreaterThan(stamped);
      }
    }
    // Under the edge it has left the table behind: half way through its fall it is lower on the picture than the red edge.
    const low = sinking(9, D, -1, 0.15, T);
    expect(project(low.x, low.height + T / 2, low.depth).y).toBeGreaterThan(project(9, 0, D).y + 4);
  });

  it('rolls a ball or a jewel that went over a corner along the rail, drawn over the bars, and with motion reduced takes it straight across', () => {
    fakeDocument();
    for (const side of SIDES) {
      for (const calm of [false, true]) {
        for (const age of [0.05, 0.3, 0.6]) {
          const x = acrossAt(5, side);
          const { screen, stage } = frame([{ id: 6, x, y: D + 0.1, kind: 'won', side, ball: true, corner: true, age }], calm);
          const balls = screen.stamps.filter((stamp) => stamp.image === stage.ball);
          expect(balls).toHaveLength(1);
          const at = railed(x, D + 0.1, side, age, BALL_RADIUS, calm);
          const centre = project(at.x, at.height, at.depth);
          expect(balls[0].x).toBeCloseTo(centre.x, 6);
          expect(balls[0].y).toBeCloseTo(centre.y, 6);
          expect(balls[0].alpha).toBe(1);
          // It is on the bars: drawn after them.
          expect(screen.log.indexOf(`image:${screen.stamps.indexOf(balls[0])}`)).toBeGreaterThan(railLaid(screen, side));
          // No medal is stamped for it.
          expect(screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement))).toHaveLength(0);
        }
        // A jewel is drawn as the stone it is, where the rail has it.
        const exit: ExitingMedal = { id: 7, x: acrossAt(5, side), y: D + 0.1, kind: 'won', side, ball: false, jewel: true, corner: true, age: 0.3 };
        const { screen } = frame([exit], calm);
        const spot = railedJewel(exit, calm);
        const drawn = [...screen.starts, ...screen.lines];
        expect(JEWEL_GIRDLE.every((corner) => near(drawn, ((at) => project(at[0], at[1], at[2]))(pointInCabinet(spot, corner))))).toBe(true);
      }
    }
    // With the roll, by 0.6 s it is well along the rail toward the tray; with motion reduced it has not moved across.
    expect(railed(5, D, -1, 0.6, BALL_RADIUS).x).toBeGreaterThan(12);
    expect(railed(5, D, -1, 0.3, BALL_RADIUS, true).x).toBe(5);
  });
});
