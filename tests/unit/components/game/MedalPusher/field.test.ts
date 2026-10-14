import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, SLOT, armCollar, armStart, armTip, fedSpot, legOf, letGo, railFrame, rollingSpot, slotSpot } from '@/components/game/MedalPusher/arms';
import {
  APRON,
  CATCHER,
  SLOPE,
  START_SLOT,
  TONGUE,
  apronSpot,
  caught,
  lampSpot,
  litSlots,
  mouthOnDrawing,
  mouthSpots,
  rolling,
  slopeSpot,
  slotCorners,
  slotHalf,
  tongueCorners,
  underCatcher,
  wellCorners,
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
  PUSHER,
  ROLL_TIME,
  TOWER,
  createMachine,
  dropJewel,
  luckySlot,
  pusherFront,
  queuePayout,
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
  BURST,
  ENTRY_INK,
  ENTRY_WORDS,
  EXIT_TIME,
  GLOW_TIME,
  GOLD_FLASH,
  HOLD_COUNT,
  RIDE,
  SLOT_LIGHT,
  SLOT_SHAPE,
  SLOT_THROAT,
  TONGUE_BRASS,
  TRAY,
  WELL_SHADE,
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
  /**
   * A slot at `time`, on the drawing: the four corners of its opening and of the frame round it, at the frame's
   * top, and of the far wall of its throat, each from the upper left one round by the right.
   */
  const slotOnDrawing = (pocket: number, time: number, wings = false) => {
    const { ring } = SLOT_SHAPE;
    const inner = slotCorners(pocket, time, wings, -ring.in, -ring.down);
    return {
      opening: slotCorners(pocket, time, wings, 0, CATCHER.rim.high).map(seen),
      outer: slotCorners(pocket, time, wings, CATCHER.rim.wide, CATCHER.rim.high).map(seen),
      wall: [seen(inner[0]), seen(inner[1]), project(inner[1].x, CATCHER.throat, inner[1].depth), project(inner[0].x, CATCHER.throat, inner[0].depth)],
    };
  };
  /** The outlines a frame filled that go through every one of these points. */
  const through = (screen: Recorder, points: { x: number; y: number }[]) => screen.fills.filter((fill) => points.every((point) => near(fill.points, point.x, point.y)));
  /**
   * How each slot looks in one frame of this stage, from the left: the top of its frame, the ring of light at the
   * upper edge of its opening and its lamp, each as it was filled; how big a field unit is at the lamp; the floor
   * of its throat and its far wall, as they were filled; and whether the floor was washed with light after that.
   */
  const slotLooks = (stage: ReturnType<typeof createStage>, machine: Machine, options: DrawOptions) => {
    const screen = recorder();
    drawField(screen.context, stage, machine, options);
    return CHECKERS.positions.map((_x, pocket) => {
      const { opening, outer, wall } = slotOnDrawing(pocket, machine.time, options.wings);
      const [top] = through(screen, [...outer, ...opening]);
      const [ring] = through(screen, [opening[0], opening[1], wall[0], wall[1]]).filter((fill) => fill.points.length === 4);
      // The lamp is a circle with its middle where the catcher has the lamp. Its dark body comes first and its light last.
      const spot = seen(lampSpot(pocket, machine.time));
      const lamps = screen.fills.filter((fill) => fill.points.length === 0 && fill.rounds.length === 1 && Math.hypot(fill.rounds[0].x - spot.x, fill.rounds[0].y - spot.y) < 1e-6);
      const lamp = lamps[lamps.length - 1];
      if (!top || !ring || !lamp) throw new Error(`slot ${pocket} was not drawn`);
      const floors = through(screen, opening).filter((fill) => fill.points.length === 4 && fill.clipped);
      const [far] = through(screen, wall).filter((fill) => fill.points.length === 4);
      // The glow of a lit slot is a round of light with its middle over the middle of the opening.
      const middle = mouthOnDrawing(pocket, machine.time, options.wings);
      const glows = screen.fills.filter((fill) => fill.points.length === 0 && fill.rounds.length === 1 && Math.hypot(fill.rounds[0].x - middle.x, fill.rounds[0].y - middle.y) < 1e-6);
      if (!far || floors.length === 0) throw new Error(`the throat of slot ${pocket} was not drawn`);
      return {
        glows: glows.map((fill) => ({ keptOut: fill.clipped })),
        frame: { style: top.style, alpha: top.alpha },
        ring: { style: ring.style, alpha: ring.alpha },
        lamp: { style: lamp.style, alpha: lamp.alpha, r: lamp.rounds[0].r },
        lampScale: spot.scale,
        floor: { style: floors[0].style, stops: floors[0].stops },
        far: far.stops,
        wash: floors.length > 1,
        // What was laid over the floor after it, each by what it was filled with and how much of it shows.
        over: floors.slice(1).map((fill) => ({ style: fill.style, stops: fill.stops, alpha: fill.alpha })),
      };
    });
  };

  it('paints nothing of the catcher into the layer that is drawn once: it rides with the pusher', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => canvas.texts.map((entry) => entry.text));
    // The words on the table and under the screen are there, so the layer was recorded; the catcher's are not.
    expect(once.filter((text) => text === 'GET')).toHaveLength(3);
    // OUT before each open side, and before each side hole's mouth at the front corners.
    expect(once.filter((text) => text === 'OUT')).toHaveLength(4);
    expect(once.filter((text) => text === 'HOLD')).toHaveLength(1);
    expect(once).not.toContain('START');
  });

  it('writes START under every slot, on the slide, tall enough to read on a phone, wherever the stroke has taken it', () => {
    fakeDocument();
    const heights = new Set<number>();
    for (const time of TIMES) {
      const words = frame(time, false).texts.filter((entry) => entry.text === 'START');
      expect(words).toHaveLength(CHUCKERS.count);
      words.forEach((word, pocket) => {
        // The foot of its letters: half the capitals' height below the middle of the strip, straight under the slot.
        const foot = seen(apronSpot(CATCHER.tile * (pocket + 0.5), APRON / 2 + APRON_CAP / 2, time));
        expect(Math.hypot(word.x - foot.x, word.y - foot.y)).toBeLessThan(1.5);
        // The strip is nearer the player than the slot, so a word under an outer slot is a pixel or two further out than the slot is.
        expect(Math.abs(word.x - mouthOnDrawing(pocket, time).x)).toBeLessThan(2.5);
        // Under the slot's frame and above the foot of the slide, which is above the medals on the lower table.
        expect(word.y).toBeGreaterThan(seen(apronSpot(0, 0, time)).y);
        expect(word.y).toBeLessThan(seen(apronSpot(0, APRON, time)).y);
        expect(seen(apronSpot(0, 0, time)).y).toBeGreaterThan(slotOnDrawing(pocket, time).outer[2].y - 1e-6);
        // Its capitals, as the canvas was told to draw them: a canvas that cannot measure is taken to draw them 7.16 tall at the size asked for.
        expect(7.16 * word.tall * PHONE).toBeGreaterThanOrEqual(7);
        // And the word is no wider than its slot's stretch of the strip.
        expect(36.7 * word.wide).toBeLessThan(CATCHER.tile * (seen(apronSpot(1, 0, time)).x - seen(apronSpot(0, 0, time)).x));
        heights.add(Math.round(word.y));
      });
    }
    // It rides out and back with the pusher: lower on the drawing the further out the lip is.
    expect(heights.size).toBeGreaterThan(3);
    expect(frame(PUSHER.period / 2, false).texts.find((entry) => entry.text === 'START')?.y).toBeGreaterThan((frame(0, false).texts.find((entry) => entry.text === 'START')?.y ?? 0) + 30);
  });

  it('draws every slot as an opening with square corners in the slide: as wide as its pocket, a frame round it, and a throat down inside it', () => {
    fakeDocument();
    for (const time of TIMES) {
      const screen = frame(time, false);
      mouthSpots(time).forEach((spot, pocket) => {
        const { opening, outer, wall } = slotOnDrawing(pocket, time);
        // The frame's top is one piece round the opening: its outline goes through the frame's four corners and the opening's four.
        const tops = through(screen, [...outer, ...opening]);
        expect(tops).toHaveLength(1);
        expect(tops[0].points).toHaveLength(8);
        expect(tops[0].clipped).toBe(false);
        // Square corners, seen from in front: the upper edge and the lower edge are level, and the lower one, which is nearer, is the longer.
        expect(opening[0].y).toBeCloseTo(opening[1].y, 9);
        expect(opening[3].y).toBeCloseTo(opening[2].y, 9);
        expect(opening[2].x - opening[3].x).toBeGreaterThan(opening[1].x - opening[0].x);
        // It is where the catcher says the slot is on the drawing, as wide and as tall, and it is big enough to see on a phone.
        const mouth = mouthOnDrawing(pocket, time);
        const middles = [(opening[0].x + opening[1].x) / 2, (opening[2].x + opening[3].x) / 2];
        expect(mouth.x).toBeGreaterThanOrEqual(Math.min(...middles) - 1e-9);
        expect(mouth.x).toBeLessThanOrEqual(Math.max(...middles) + 1e-9);
        expect(opening[1].x - opening[0].x).toBeLessThan(mouth.wide);
        expect(opening[2].x - opening[3].x).toBeGreaterThan(mouth.wide);
        expect(opening[0].y).toBeLessThan(mouth.y);
        expect(opening[3].y).toBeGreaterThan(mouth.y);
        expect(opening[3].y - opening[0].y).toBeCloseTo(mouth.tall, 9);
        expect(mouth.wide * PHONE).toBeGreaterThan(18);
        expect(mouth.tall * PHONE).toBeGreaterThan(8.8);
        // As wide inside as a medal that just fits, and the whole of it, frame and all, below the lip.
        expect(mouth.wide).toBeCloseTo((MEDAL_RADIUS + CHECKERS.halfWidth) * 2 * seen(slopeSpot(spot.x, CATCHER.back + START_SLOT.long / 2, time, CATCHER.rim.high)).scale, 9);
        expect(outer[0].y).toBeGreaterThan(project(spot.x, P, pusherFront(time)).y);
        // Down inside it, and only inside it: the floor of the throat, over the whole opening. It is black in a slot that waits, and the lucky lamp's gold in the slot it is on.
        const lucky = litSlots(time)[pocket];
        const floors = through(screen, opening).filter((fill) => fill.points.length === 4);
        expect(floors).toHaveLength(1);
        expect(floors[0].clipped).toBe(true);
        expect([floors[0].style, floors[0].stops]).toEqual(lucky ? ['', [...SLOT_THROAT.gold.floor]] : [SLOT_THROAT.floor, []]);
        // Over that, the far wall, from under the ring of light down to the floor, which is what gives the hole its depth: its foot is well down the opening, and there is floor to be seen under it.
        const walls = through(screen, wall).filter((fill) => fill.points.length === 4);
        expect(walls).toHaveLength(1);
        expect(walls[0].clipped).toBe(true);
        expect(walls[0].stops).toEqual([...(lucky ? SLOT_THROAT.gold.far : SLOT_THROAT.far)]);
        expect(wall[3].y).toBeGreaterThan(opening[0].y + (opening[3].y - opening[0].y) / 4);
        expect(wall[3].y).toBeLessThan(opening[3].y);
        // And the ring of light, sloping down into the throat from the upper edge of the opening to the top of that wall.
        const rings = through(screen, [opening[0], opening[1], wall[0], wall[1]]).filter((fill) => fill.points.length === 4);
        expect(rings).toHaveLength(1);
        expect(rings[0].clipped).toBe(true);
        expect(wall[0].y).toBeGreaterThan(opening[0].y);
      });
    }
  });

  it('is one piece, as long as the three pockets take: a dark well under the lip, a tongue of brass over it to each slot, and a slide from the well’s edge down to its foot, with the strip of words on the last of it', () => {
    fakeDocument();
    for (const time of TIMES) {
      const front = pusherFront(time);
      const screen = frame(time, false);
      const { starts, lines } = screen;
      /** Where in the order of the frame's fills one of them came. */
      const order = (fill: (typeof screen.fills)[number] | undefined): number => (fill ? screen.fills.indexOf(fill) : -1);
      // The well: one outline, from the lip to the upper edge of the slide, from end to end, dark and darker toward the slide, and never black.
      const [well] = through(screen, wellCorners(time).map(seen)).filter((fill) => fill.points.length === 4);
      expect(well.stops).toEqual([...WELL_SHADE]);
      expect(WELL_SHADE).not.toContain(SLOT_THROAT.floor);
      // The board itself: one outline, from the well's edge to the catcher's own foot, from end to end. Nothing is drawn from the lip to the foot in one piece: under the lip it is open.
      const board = [slopeSpot(CATCHER.from, CATCHER.gap, time), slopeSpot(CATCHER.to, CATCHER.gap, time), slopeSpot(CATCHER.to, SLOPE.long, time), slopeSpot(CATCHER.from, SLOPE.long, time)].map(seen);
      const [slide] = through(screen, board).filter((fill) => fill.points.length === 4);
      expect(order(slide)).toBeGreaterThan(order(well));
      const whole = [slopeSpot(CATCHER.from, 0, time), slopeSpot(CATCHER.to, 0, time), slopeSpot(CATCHER.to, SLOPE.long, time), slopeSpot(CATCHER.from, SLOPE.long, time)].map(seen);
      expect(through(screen, whole).filter((fill) => fill.points.length === 4)).toHaveLength(0);
      // A tongue to each slot, drawn over the well and the slide: its top, from the lip to the upper edge of the
      // opening, in brass, lit where the lucky lamp is on its slot; and the side of its web that is turned to the
      // player, who looks down the middle of the field, which the middle one's is not.
      mouthSpots(time).forEach((spot, pocket) => {
        const lucky = litSlots(time)[pocket];
        const top = tongueCorners(pocket, time).map(seen);
        const web = tongueCorners(pocket, time, false, CATCHER.rim.high - TONGUE.deep).map(seen);
        const [bridge] = through(screen, top).filter((fill) => fill.points.length === 4);
        expect(bridge.stops).toEqual([...(lucky ? TONGUE_BRASS.lit : TONGUE_BRASS.top)]);
        expect(order(bridge)).toBeGreaterThan(order(slide));
        expect(top[3].y).toBeCloseTo(slotOnDrawing(pocket, time).opening[0].y, 9);
        expect(top[0].y).toBeLessThan(top[3].y - 20);
        const sides = [
          [top[0], top[3], web[3], web[0]],
          [top[1], top[2], web[2], web[1]],
        ].map((side) => through(screen, side).filter((fill) => fill.points.length === 4 && fill.style === (lucky ? TONGUE_BRASS.litSide : TONGUE_BRASS.side)));
        expect(sides.map((side) => side.length)).toEqual(spot.x < FIELD.width / 2 ? [0, 1] : spot.x > FIELD.width / 2 ? [1, 0] : [0, 0]);
        for (const side of sides.flat()) expect(order(side)).toBeLessThan(order(bridge));
      });
      for (const [x, height, depth] of [
        [CATCHER.from, CATCHER.deck, front],
        [CATCHER.to, CATCHER.deck, front],
        [CATCHER.to, CATCHER.foot.height, front + CATCHER.foot.out],
        [CATCHER.from, CATCHER.foot.height, front + CATCHER.foot.out],
      ]) {
        const corner = project(x, height, depth);
        expect(near([...starts, ...lines], corner.x, corner.y)).toBe(true);
      }
      // It leans toward the player: its foot is lower on the drawing than a level board from the lip would reach as far out.
      expect(board[2].y).toBeGreaterThan(project(CATCHER.to, CATCHER.deck, front + CATCHER.foot.out).y);
      // The strip with the words, from under the slots' frames to the foot.
      const span = CATCHER.to - CATCHER.from;
      for (const corner of [apronSpot(0, 0, time), apronSpot(span, 0, time), apronSpot(span, APRON, time), apronSpot(0, APRON, time)].map(seen)) expect(near([...starts, ...lines], corner.x, corner.y)).toBe(true);
      // Nothing of the old panel is on the pusher's top: no plate behind the lip.
      const behind = project(CATCHER.from, P, front - 7.4);
      expect(near([...starts, ...lines], behind.x, behind.y)).toBe(false);
    }
  });

  it('gives each slot its own colour while it waits, and lights the one the lucky lamp is on gold, steadily: its frame, its ring, its lamp, which is bigger, and the whole of its mouth', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    expect(new Set(SLOT_LIGHT.own).size).toBe(CHUCKERS.count);
    /** How bright a colour is, from 0 to 1: the brightest of its red, green and blue. */
    const bright = (hex: string) => Math.max(...[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))) / 255;
    /** Whether a colour is a gold, pale or deep: bright red, no more green than red, and a good deal less blue than either. */
    const golden = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
      return r > 180 && r >= g && g - b >= 30;
    };
    expect(golden(SLOT_THROAT.far[0])).toBe(false);
    // The throat of a slot that waits is dark where it counts: its floor is black, and the light the far wall catches at its top is gone by its foot.
    expect(SLOT_THROAT.floor).toBe('#000000');
    expect(SLOT_THROAT.far[SLOT_THROAT.far.length - 1]).toBe('#000000');
    expect(SLOT_THROAT.side[SLOT_THROAT.side.length - 1]).toBe('#000000');
    expect(bright(SLOT_THROAT.far[0])).toBeGreaterThan(0.9);
    SLOT_THROAT.far.forEach((colour, at) => expect(bright(colour)).toBeLessThanOrEqual(at === 0 ? 1 : bright(SLOT_THROAT.far[at - 1])));
    // The gold that fills the lucky slot's mouth is gold all the way down, far wall, sides and floor, and none of it is dark: its deepest is brighter than three quarters.
    for (const colour of [...SLOT_THROAT.gold.far, ...SLOT_THROAT.gold.side, ...SLOT_THROAT.gold.floor]) {
      expect(golden(colour)).toBe(true);
      expect(bright(colour)).toBeGreaterThan(0.75);
    }
    // And a frame that waits is bright brass, not the dull gold it was: brighter than nine tenths, and still not a lit frame.
    expect(bright(SLOT_LIGHT.idle)).toBeGreaterThan(0.9);
    expect(golden(SLOT_LIGHT.idle)).toBe(true);
    expect(new Set([SLOT_LIGHT.idle, SLOT_LIGHT.gold, SLOT_LIGHT.flash]).size).toBe(3);
    for (let stroke = 0; stroke <= CHUCKERS.count; stroke++) {
      machine.time = (stroke + 0.3) * LUCKY.dwell;
      const lucky = luckySlot(machine.time);
      // It steps one slot along with every stroke of the pusher, and comes round again.
      expect(lucky).toBe(stroke % CHUCKERS.count);
      expect(litSlots(machine.time).indexOf(true)).toBe(lucky);
      const looks = [0, 0.13, 0.31, 0.77, 1.5].map((later) => {
        stage.clock = 5 + later;
        return slotLooks(stage, machine, { showGuide: false });
      });
      for (const look of looks) {
        look.forEach((slot, pocket) => {
          expect(slot.frame.style).toBe(pocket === lucky ? SLOT_LIGHT.gold : SLOT_LIGHT.idle);
          expect(slot.ring.style).toBe(pocket === lucky ? SLOT_LIGHT.flash : SLOT_LIGHT.own[pocket]);
          expect(slot.lamp.style).toBe(pocket === lucky ? SLOT_LIGHT.lamp : SLOT_LIGHT.own[pocket]);
          // A frame is solid whatever its slot is doing; only the lights of a slot that waits glow more and less.
          expect(slot.frame.alpha).toBe(1);
          // One lamp, as big as the catcher says, and a quarter bigger again while the slot is lit.
          expect(slot.lamp.r / slot.lampScale).toBeCloseTo(START_SLOT.lamp.radius * (pocket === lucky ? 1.25 : 1), 6);
        });
        // The lit slot is wholly lit in every frame, and exactly as it was in the frame before: it does not flash.
        expect(look[lucky].ring.alpha).toBe(1);
        expect(look[lucky].lamp.alpha).toBe(1);
        expect(look[lucky]).toEqual(looks[0][lucky]);
        // Nothing flashes over a slot nobody has put a medal down. The lit slot's mouth is filled with its gold, floor
        // and far wall, and its glow lies over its opening as well as round it; a slot that waits is dark down its
        // throat, and has no glow at all.
        look.forEach((slot, pocket) => {
          expect(slot.wash).toBe(false);
          expect(slot.glows).toEqual(pocket === lucky ? [{ keptOut: false }] : []);
          expect(slot.floor).toEqual(pocket === lucky ? { style: '', stops: [...SLOT_THROAT.gold.floor] } : { style: SLOT_THROAT.floor, stops: [] });
          expect(slot.far).toEqual([...(pocket === lucky ? SLOT_THROAT.gold.far : SLOT_THROAT.far)]);
        });
      }
    }
  });

  it('opens the wings during chance time: all three slots are gold, their openings are wider, and each wing has swung out from the frame instead of lying along it', () => {
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
      const folded = draw({ showGuide: false });
      const open = draw({ showGuide: false, wings: true });
      expect(draw({ showGuide: false, wings: false }).fills).toEqual(folded.fills);
      // Gold, all three, whichever the lucky lamp is on.
      for (const slot of slotLooks(stage, machine, { showGuide: false, wings: true })) {
        expect(slot.frame.style).toBe(SLOT_LIGHT.gold);
        expect(slot.ring.style).toBe(SLOT_LIGHT.flash);
        expect(slot.lamp.style).toBe(SLOT_LIGHT.lamp);
        expect(slot.floor.stops).toEqual([...SLOT_THROAT.gold.floor]);
        expect(slot.far).toEqual([...SLOT_THROAT.gold.far]);
        expect(slot.lamp.r / slot.lampScale).toBeCloseTo(START_SLOT.lamp.radius * 1.25, 6);
        expect([slot.frame.alpha, slot.ring.alpha, slot.lamp.alpha]).toEqual([1, 1, 1]);
      }
      for (let pocket = 0; pocket < CHUCKERS.count; pocket++) {
        const narrow = slotOnDrawing(pocket, time);
        const wide = slotOnDrawing(pocket, time, true);
        // The opening and its frame, at the one width or the other: wider by what the rule is wider by, to either side.
        expect(through(folded, [...narrow.outer, ...narrow.opening])).toHaveLength(1);
        expect(through(folded, [...wide.outer, ...wide.opening])).toHaveLength(0);
        expect(through(open, [...wide.outer, ...wide.opening])).toHaveLength(1);
        expect(through(open, [...narrow.outer, ...narrow.opening])).toHaveLength(0);
        expect((wide.opening[1].x - wide.opening[0].x) / (narrow.opening[1].x - narrow.opening[0].x)).toBeCloseTo(slotHalf(true) / slotHalf(), 9);
        for (const side of [-1, 1]) {
          // The top of the wing, a low fence on the slide: lying along the side of the frame, or swung out from it at its upper end.
          const lying = wingCorners(pocket, side, time, false, START_SLOT.wing.high).map(seen);
          const swung = wingCorners(pocket, side, time, true, START_SLOT.wing.high).map(seen);
          const tops = through(folded, lying).filter((fill) => fill.points.length === 4);
          expect(tops).toHaveLength(1);
          expect(tops[0].clipped).toBe(false);
          expect(through(open, lying)).toHaveLength(0);
          expect(through(open, swung).filter((fill) => fill.points.length === 4)).toHaveLength(1);
          expect(through(folded, swung)).toHaveLength(0);
          // Open, it is hinged at its lower end against the side of the wider frame, and its upper end has swung out from
          // the slot by as much as the catcher says: the two of a slot make a funnel that opens toward the lip.
          const hinge = CHECKERS.positions[pocket] + side * (slotHalf(true) + CATCHER.rim.wide);
          const ends = [CATCHER.back - CATCHER.rim.wide, CATCHER.back + START_SLOT.long + CATCHER.rim.wide].map((down) => seen(slopeSpot(hinge, down, time, START_SLOT.wing.high)));
          expect(swung[3].x).toBeCloseTo(ends[1].x, 6);
          expect(swung[3].y).toBeCloseTo(ends[1].y, 6);
          expect((swung[0].x - ends[0].x) * side).toBeCloseTo(START_SLOT.wing.out * ends[0].scale, 6);
          expect(swung[0].y).toBeCloseTo(ends[0].y, 6);
          // Folded, both its ends are against the side of the frame it lies along.
          const along = CHECKERS.positions[pocket] + side * (slotHalf() + CATCHER.rim.wide);
          expect(lying[0].x).toBeCloseTo(seen(slopeSpot(along, CATCHER.back - CATCHER.rim.wide, time, START_SLOT.wing.high)).x, 6);
          expect(lying[3].x).toBeCloseTo(seen(slopeSpot(along, CATCHER.back + START_SLOT.long + CATCHER.rim.wide, time, START_SLOT.wing.high)).x, 6);
          // And an open wing is a different gold from a folded one.
          expect(through(open, swung).filter((fill) => fill.points.length === 4)[0].style).not.toBe(tops[0].style);
        }
      }
    }
  });

  it('flashes a slot a medal has just gone down brighter than gold, all the way down, for as long as it shines, and no other slot', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const lucky = luckySlot(machine.time);
    const gate = (lucky + 2) % CHUCKERS.count;
    const idle = (lucky + 1) % CHUCKERS.count;
    lightGate(stage, gate);
    const lit = slotLooks(stage, machine, { showGuide: false });
    // Its frame is brighter than a gold one, its ring and its lamp are lit, and the light goes down to the floor of its throat.
    expect(SLOT_LIGHT.flash).not.toBe(SLOT_LIGHT.gold);
    expect(lit[gate].frame.style).toBe(SLOT_LIGHT.flash);
    expect(lit[gate].ring.style).toBe(SLOT_LIGHT.flash);
    expect(lit[gate].lamp.style).toBe(SLOT_LIGHT.lamp);
    expect(lit[gate].lamp.r / lit[gate].lampScale).toBeCloseTo(START_SLOT.lamp.radius * 1.25, 6);
    expect(lit[gate].wash).toBe(true);
    expect(lit[gate].glows).toEqual([{ keptOut: false }]);
    // Its throat is the dark throat of a slot that waits, with the gold laid over all of it, wholly at first, and a wash of light over that.
    expect(lit[gate].floor).toEqual({ style: SLOT_THROAT.floor, stops: [] });
    expect(lit[gate].over).toHaveLength(2);
    expect(lit[gate].over[0]).toEqual({ style: '', stops: [...SLOT_THROAT.gold.floor], alpha: 1 });
    expect(lit[gate].over[1].style).toMatch(/^rgba\(255, 251, 224, /);
    // The others are as they were: the lucky one gold, the third waiting in its own colour, dark down its throat.
    expect(lit[lucky].frame.style).toBe(SLOT_LIGHT.gold);
    expect(lit[lucky].wash).toBe(false);
    expect(lit[idle].frame.style).toBe(SLOT_LIGHT.idle);
    expect(lit[idle].lamp.style).toBe(SLOT_LIGHT.own[idle]);
    expect(lit[idle].wash).toBe(false);
    expect(lit[idle].floor.style).toBe(SLOT_THROAT.floor);
    expect(lit[idle].far).toEqual([...SLOT_THROAT.far]);
    // Half way through it is still lit; when the time is up it is a slot that waits again. It is lit once for a medal, not on and off.
    ageStage(stage, GLOW_TIME / 2);
    const fading = slotLooks(stage, machine, { showGuide: false })[gate];
    expect(fading.frame.style).toBe(SLOT_LIGHT.flash);
    // The gold in its throat fades with the flash: half of it shows half way through, so that it goes back to the dark with no step.
    expect(fading.over[0].stops).toEqual([...SLOT_THROAT.gold.floor]);
    expect(fading.over[0].alpha).toBeCloseTo(0.5, 6);
    ageStage(stage, GLOW_TIME / 2 + 0.01);
    const after = slotLooks(stage, machine, { showGuide: false });
    expect(after[gate].frame.style).toBe(SLOT_LIGHT.idle);
    expect(after[gate].lamp.style).toBe(SLOT_LIGHT.own[gate]);
    expect(after[gate].wash).toBe(false);
    expect(after[gate].floor.style).toBe(SLOT_THROAT.floor);
    // A medal down the lucky slot, whose mouth is gold already, lays no more gold in it: only the wash of light.
    lightGate(stage, lucky);
    const both = slotLooks(stage, machine, { showGuide: false })[lucky];
    expect(both.floor.stops).toEqual([...SLOT_THROAT.gold.floor]);
    expect(both.over).toHaveLength(1);
    expect(both.over[0].style).toMatch(/^rgba\(255, 251, 224, /);
  });

  it('lets nothing about a slot flash faster than the cabinet’s one rate, in a fever and a jackpot as at any other time, and nothing at all with motion reduced', () => {
    fakeDocument();
    const machine = createMachine(3);
    machine.medals = [];
    machine.time = 1.5;
    const lucky = luckySlot(machine.time);
    const SECONDS = 2;
    /** How many times a light comes up bright in the frames it was seen in: up through the middle of how bright and how dim it gets. */
    const risings = (shown: number[]) => {
      const middle = (Math.max(...shown) + Math.min(...shown)) / 2;
      return shown.filter((bright, at) => at > 0 && shown[at - 1] < middle && bright >= middle).length;
    };
    for (const party of [null, 'fever', 'jackpot'] as const) {
      for (const calm of [false, true]) {
        const stage = createStage(1);
        if (party) celebrate(stage, party);
        const shown = CHECKERS.positions.map(() => ({ ring: [] as number[], lamp: [] as number[] }));
        // Thirty looks a second: a light that flashed as often as the gold lamps, or oftener, would show in them.
        for (let at = 0; at <= SECONDS * 30; at++) {
          stage.clock = 3 + at / 30;
          slotLooks(stage, machine, { showGuide: false, calm }).forEach((slot, pocket) => {
            shown[pocket].ring.push(slot.ring.alpha);
            shown[pocket].lamp.push(slot.lamp.alpha);
          });
        }
        shown.forEach((lights, pocket) => {
          for (const light of [lights.ring, lights.lamp]) {
            const swing = Math.max(...light) - Math.min(...light);
            // The lit slot is steady, and with motion reduced so is every slot.
            if (pocket === lucky || calm) expect(swing).toBe(0);
            else {
              // A slot that waits glows more and less, gently, and never as often as the gold lamps flash.
              expect(swing).toBeGreaterThan(0);
              expect(Math.min(...light)).toBeGreaterThan(0.5);
              expect(risings(light)).toBeLessThanOrEqual(GOLD_FLASH.perSecond * SECONDS);
            }
          }
        });
      }
    }
  });

  it('draws the catcher in the same place with reduced motion: it is part of the machine', () => {
    fakeDocument();
    for (const time of TIMES) {
      const moving = frame(time, false);
      const calm = frame(time, true);
      expect(calm.texts.filter((entry) => entry.text === 'START')).toEqual(moving.texts.filter((entry) => entry.text === 'START'));
      expect(calm.arcs).toEqual(moving.arcs);
      // Every outline of it is where it was: only how brightly some of them are lit differs.
      for (let pocket = 0; pocket < CHUCKERS.count; pocket++) {
        const { opening, outer, wall } = slotOnDrawing(pocket, time);
        for (const outline of [[...outer, ...opening], wall, opening]) expect(through(calm, outline).map((fill) => fill.points)).toEqual(through(moving, outline).map((fill) => fill.points));
      }
    }
  });

  it('lights the slot of the number it is told, and no other: its stretch of the strip of words, and its word', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    /** The stretches of the strip that were filled over with light, by where each begins along it. */
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

  /** A medal that came over the lip at `x` on a machine at 1.5 seconds, and one frame of the field with only it on it. */
  const lone = (id: number, x: number) => {
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    const medal = (sinceDrop: number): Medal => ({ id, x, y: front + MEDAL_RADIUS, level: 0, tier: 0, sinceDrop, stack: 1, ball: false, grown: 1 });
    /** What was drawn, the pictures of medals among it, and whether the medal's was drawn after the catcher. */
    const drawn = (sinceDrop: number, options: Partial<DrawOptions> = {}) => {
      machine.medals = [medal(sinceDrop)];
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false, ...options });
      // A medal has the face of its own tone, wherever it is drawn.
      const stamps = screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement));
      return { screen, stamps, after: screen.log.indexOf(`image:${screen.stamps.indexOf(stamps[0])}`) > screen.log.indexOf('text:START') };
    };
    return { machine, front, medal, drawn };
  };
  /**
   * How far from the edge of a medal as it was drawn a point of the drawing is, in the medal's own radii: 1 is on
   * its edge. The canvas was told to draw its face between two lines across it at right angles.
   */
  const reach = (stamp: Stamp, point: { x: number; y: number }): number => {
    const [a, b] = stamp.across;
    const [c, d] = stamp.down;
    const dx = point.x - stamp.x;
    const dy = point.y - stamp.y;
    const det = a * d - b * c;
    return Math.hypot((dx * d - dy * c) / det, (dy * a - dx * b) / det);
  };
  /** Where the lowest point of the edge of a medal that is tipped straight forward is, in the cabinet. */
  const nose = (held: { x: number; height: number; depth: number; tilt: number }) => ({ x: held.x, height: held.height - MEDAL_RADIUS * Math.sin(held.tilt), depth: held.depth + MEDAL_RADIUS * Math.cos(held.tilt) });
  const T = HEIGHT.medal;
  /**
   * The face of a medal the catcher has: the catcher says where its middle is, and its face is half its thickness
   * from that, the way the face looks. It is what the canvas stamps; the rim shows as far the other side of the middle.
   */
  const faceOf = <Held extends { x: number; height: number; depth: number; tilt: number; heading: number }>(held: Held): Held => ({
    ...held,
    x: held.x - Math.sin(held.heading) * Math.sin(held.tilt) * (T / 2),
    height: held.height + Math.cos(held.tilt) * (T / 2),
    depth: held.depth + Math.cos(held.heading) * Math.sin(held.tilt) * (T / 2),
  });
  /** The shadows a frame drew under medals on the lower table: each is an oval and nothing else, in the shade a medal throws on the table. */
  const shades = (screen: Recorder) => screen.fills.filter((fill) => fill.style === 'rgba(0, 4, 18, 0.34)' && fill.points.length <= 1 && fill.rounds.length === 0);

  it('draws a medal on its way into its slot lying on its tongue with its face up and then nosing into the opening, darker as it goes, and not among the medals on the table', () => {
    fakeDocument();
    const x = CHECKERS.positions[0] + 1;
    const { machine, front, medal, drawn } = lone(901, x);
    const legs = new Set<string>();
    let last = { y: -Infinity, dark: 0 };
    for (let sinceDrop = 0.01; sinceDrop < CATCHER.sink; sinceDrop += 1 / 60) {
      const held = caught(medal(sinceDrop), machine.time);
      if (!held) throw new Error('not caught');
      expect(held.chucker).toBe(0);
      const { screen, stamps, after } = drawn(sinceDrop);
      // One picture of it, in full, its face half its thickness over where the catcher has its middle, after the catcher, and nothing where the engine has it lying.
      expect(stamps).toHaveLength(1);
      const at = seen(faceOf(held));
      expect(stamps[0].x).toBeCloseTo(at.x, 6);
      expect(stamps[0].y).toBeCloseTo(at.y, 6);
      expect(stamps[0].alpha).toBe(1);
      expect(after).toBe(true);
      // Tipped as the catcher has it: the edge of the picture goes through where the nose of its face is.
      expect(reach(stamps[0], seen(nose(faceOf(held))))).toBeCloseTo(1, 1);
      // On its tongue it is seen whole. In the slot, what of it is under the slide is seen only down the opening.
      expect(stamps[0].clipped).toBe(held.leg === 'slot');
      // The less light it gets the darker it is: a dark wash over its face, as strong as the light is weak. It is never fainter.
      const washes = screen.fills.filter((fill) => fill.style === MEDAL_SHADE.dark);
      expect(washes).toHaveLength(held.light < 1 ? 1 : 0);
      const dark = washes.length ? washes[0].alpha : 0;
      expect(dark).toBeCloseTo(1 - held.light, 9);
      expect(dark).toBeGreaterThanOrEqual(last.dark);
      // It goes down the drawing as it goes down its tongue.
      expect(stamps[0].y).toBeGreaterThan(last.y - 1e-9);
      last = { y: stamps[0].y, dark };
      legs.add(held.leg);
    }
    expect([...legs]).toEqual(['tongue', 'slot']);
    // It ends in its slot, on the drawing as in the cabinet, most of the way to dark.
    const mouth = mouthOnDrawing(0, machine.time);
    expect(Math.abs(seen(caught(medal(CATCHER.sink - 0.001), machine.time) ?? { x: 0, height: 0, depth: 0 }).x - mouth.x)).toBeLessThan(mouth.wide / 2);
    expect(last.dark).toBeGreaterThan(0.5);
    // Once it is down it is a medal on the lower table again, under the catcher, drawn before the catcher is.
    const lying = drawn(CATCHER.sink + 0.01);
    expect(lying.stamps).toHaveLength(1);
    expect(lying.stamps[0].alpha).toBe(1);
    expect(lying.after).toBe(false);
    const where = project(x, HEIGHT.medal, front + MEDAL_RADIUS);
    expect(lying.stamps[0].x).toBeCloseTo(where.x, 6);
    expect(lying.stamps[0].y).toBeCloseTo(where.y, 6);
    // Where nothing may move it is not seen to ride: one picture of it, lying still in the mouth of its slot, darker and darker.
    const still = caught(medal(0.01), machine.time, true);
    if (!still) throw new Error('not caught');
    let shade = -1;
    for (let sinceDrop = 0.01; sinceDrop < CATCHER.still; sinceDrop += 1 / 60) {
      const calm = drawn(sinceDrop, { calm: true });
      expect(calm.stamps).toHaveLength(1);
      expect(calm.stamps[0].x).toBeCloseTo(seen(faceOf(still)).x, 6);
      expect(calm.stamps[0].y).toBeCloseTo(seen(faceOf(still)).y, 6);
      expect(calm.after).toBe(true);
      const dark = calm.screen.fills.filter((fill) => fill.style === MEDAL_SHADE.dark).map((fill) => fill.alpha)[0] ?? 0;
      expect(dark).toBeGreaterThan(shade);
      shade = dark;
    }
    expect(Math.abs(seen(faceOf(still)).y - mouth.y)).toBeLessThan(mouth.tall);
  });

  it('draws a medal that came over clear of the tongues going over the lip’s edge and down into the well: seen above the slide’s upper edge and no lower, darker as it goes, and then under the catcher, as the 3D picture has it', () => {
    fakeDocument();
    // Half way between two slots: over the lip at the catcher, with no tongue under any of it.
    const x = (CHECKERS.positions[0] + CHECKERS.positions[1]) / 2;
    const { machine, front, medal, drawn } = lone(902, x);
    let last = { y: -Infinity, dark: 0 };
    for (let sinceDrop = 0.005; sinceDrop < CATCHER.fall; sinceDrop += 1 / 120) {
      const held = caught(medal(sinceDrop), machine.time);
      if (!held) throw new Error('not held');
      expect(held).toMatchObject({ chucker: -1, near: -1, leg: 'gap' });
      const { screen, stamps, after } = drawn(sinceDrop);
      // One picture of it: its face over where the catcher has its middle, tipped as the catcher has it, after the catcher and the pusher's top.
      expect(stamps).toHaveLength(1);
      const at = seen(faceOf(held));
      expect(stamps[0].x).toBeCloseTo(at.x, 6);
      expect(stamps[0].y).toBeCloseTo(at.y, 6);
      expect(reach(stamps[0], seen(nose(faceOf(held))))).toBeCloseTo(1, 1);
      expect(after).toBe(true);
      // It is going down behind the slide: nothing of it is drawn below the slide's upper edge. And it is never fainter, only darker.
      expect(stamps[0].clipped).toBe(true);
      expect(stamps[0].alpha).toBe(1);
      const dark = screen.fills.filter((fill) => fill.style === MEDAL_SHADE.dark).map((fill) => fill.alpha)[0] ?? 0;
      expect(dark).toBeCloseTo(1 - held.light, 9);
      expect(dark).toBeGreaterThanOrEqual(last.dark);
      // It goes down the drawing all the way, and throws no shadow on a table it does not come down on in sight.
      expect(stamps[0].y).toBeGreaterThan(last.y);
      expect(shades(screen)).toHaveLength(0);
      last = { y: stamps[0].y, dark };
    }
    expect(last.dark).toBeGreaterThan(0.8);
    // Where the well's mouth ends on the drawing: the upper edge of the slide. The picture is cut off there.
    const edge = seen(slopeSpot(x, CATCHER.gap, machine.time));
    expect(edge.y).toBeGreaterThan(project(x, P, front).y + 10);
    // Once it is down it is a medal on the lower table, where the engine has it, under the catcher: drawn with the
    // table's own, before the catcher, which covers it.
    const lying = drawn(CATCHER.fall + 0.01);
    expect(lying.stamps).toHaveLength(1);
    expect(lying.stamps[0].clipped).toBe(false);
    expect(lying.after).toBe(false);
    const where = project(x, T, front + MEDAL_RADIUS);
    expect(lying.stamps[0].x).toBeCloseTo(where.x, 6);
    expect(lying.stamps[0].y).toBeCloseTo(where.y, 6);
    expect(underCatcher(x, front + MEDAL_RADIUS, MEDAL_RADIUS, machine.time)).toBe(true);
  });

  it('draws a medal that hangs on a tongue’s edge in full view, rocked over it, and then going down into the well behind the slide; and not hanging at all with motion reduced', () => {
    fakeDocument();
    // A quarter of a unit off the right-hand edge of the middle slot's tongue: the nearest of misses.
    const x = CHECKERS.positions[1] + CHECKERS.halfWidth + 0.25;
    const { machine, medal, drawn } = lone(903, x);
    /** How much lower on the drawing the right-hand end of a medal's picture is than its middle. */
    const droop = (stamp: Stamp): number => (stamp.across[0] * stamp.across[1] + stamp.down[0] * stamp.down[1]) / Math.hypot(stamp.across[0], stamp.down[0]);
    const droops: number[] = [];
    const legs = new Set<string>();
    for (let sinceDrop = 0.005; sinceDrop < 2; sinceDrop += 1 / 120) {
      const held = caught(medal(sinceDrop), machine.time);
      if (!held) break;
      expect(held.near).toBe(1);
      legs.add(held.leg);
      const { stamps, after } = drawn(sinceDrop);
      // One picture of it, its face over where the catcher has its middle, after the catcher: whole while it is on the tongue, and cut off at the slide's upper edge once it is going down.
      expect(stamps).toHaveLength(1);
      const at = seen(faceOf(held));
      expect(stamps[0].x).toBeCloseTo(at.x, 6);
      expect(stamps[0].y).toBeCloseTo(at.y, 6);
      expect(after).toBe(true);
      expect(stamps[0].clipped).toBe(held.leg === 'gap');
      if (held.leg !== 'tongue' || held.heading === 0) continue;
      // Rocked as the catcher has it: the side of it that is down in the cabinet is down on the drawing. Its right-hand
      // end is where the right-hand end of a medal rocked that far about the line down the tongue is.
      const sway = Math.sin(held.heading) * Math.sin(held.tilt);
      const along = Math.sqrt(1 - sway * sway);
      const lean = Math.cos(held.heading) * Math.sin(held.tilt);
      const face = faceOf(held);
      const right = { x: face.x + MEDAL_RADIUS * along, height: face.height + (MEDAL_RADIUS * sway * Math.cos(held.tilt)) / along, depth: face.depth + (MEDAL_RADIUS * sway * lean) / along };
      expect(reach(stamps[0], seen(right))).toBeCloseTo(1, 1);
      expect(droop(stamps[0])).toBeCloseTo(seen(right).y - at.y, 0);
      droops.push(droop(stamps[0]));
    }
    expect([...legs]).toEqual(['tongue', 'gap']);
    // It is seen rocked for a good many frames: its right-hand side, the one with nothing under it, is the low one, never the other, and in the end by many pixels of the drawing.
    expect(droops.length).toBeGreaterThan(40);
    expect(Math.min(...droops)).toBeGreaterThan(-0.5);
    expect(Math.max(...droops)).toBeGreaterThan(6);
    // With motion reduced it never hangs: it goes over the lip's edge nose first, level across, and is down in the time that takes.
    for (let sinceDrop = 0.005; sinceDrop < CATCHER.fall; sinceDrop += 1 / 60) {
      const still = caught(medal(sinceDrop), machine.time, true);
      if (!still) throw new Error('not held');
      expect(still).toMatchObject({ near: -1, leg: 'gap', heading: 0 });
      const { stamps } = drawn(sinceDrop, { calm: true });
      expect(stamps).toHaveLength(1);
      expect(stamps[0].x).toBeCloseTo(seen(faceOf(still)).x, 6);
      expect(stamps[0].y).toBeCloseTo(seen(faceOf(still)).y, 6);
      expect(Math.abs(droop(stamps[0]))).toBeLessThan(0.5);
    }
    expect(caught(medal(CATCHER.fall + 0.01), machine.time, true)).toBeNull();
  });

  it('draws a ball that lies under the catcher before the catcher, which covers it, one that has come out from under it after, and one that has just come over the lip rolling down the slide', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    // A ball that came over the lip long ago, unless it is said when: it lies where the engine has it.
    const ball = (y: number, sinceDrop = 30): Medal => ({ id: 902, x: 50, y, level: 0, tier: 0, sinceDrop, stack: 1, ball: true, grown: 1 });
    const order = (medal: Medal) => {
      machine.medals = [medal];
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false });
      const balls = screen.stamps.flatMap((stamp, index) => (stamp.image === stage.ball ? [index] : []));
      expect(balls).toHaveLength(1);
      return { ball: screen.log.indexOf(`image:${balls[0]}`), catcher: screen.log.indexOf('text:START'), stamp: screen.stamps[balls[0]] };
    };
    // At the foot of the pusher's face, under the catcher: it is taller than the catcher, and the catcher is drawn over it.
    expect(BALL_RADIUS * 2).toBeGreaterThan(CATCHER.deck);
    const under = order(ball(front + MEDAL_RADIUS));
    expect(under.ball).toBeLessThan(under.catcher);
    expect(underCatcher(50, front + MEDAL_RADIUS, BALL_RADIUS, machine.time)).toBe(true);
    // Its middle out past the catcher's foot: it stands in front of the slide, and is drawn over it.
    const clear = order(ball(front + CATCHER.foot.out + 1));
    expect(clear.ball).toBeGreaterThan(clear.catcher);
    // Far down the table it is nowhere near the catcher, and is drawn with the other medals as it always was.
    const far = order(ball(front + CATCHER.foot.out + BALL_RADIUS * 2 + 5));
    expect(far.ball).toBeLessThan(far.catcher);
    // One that has only just come over the lip at the catcher is on its slide: drawn last, whole, where the catcher has it rolling, further down the drawing as it goes.
    let last = -Infinity;
    for (const sinceDrop of [0.02, 0.15, 0.3, 0.45]) {
      const rolled = rolling(ball(front + MEDAL_RADIUS, sinceDrop), BALL_RADIUS, machine.time);
      if (!rolled) throw new Error('not rolling');
      const going = order(ball(front + MEDAL_RADIUS, sinceDrop));
      expect(going.ball).toBeGreaterThan(going.catcher);
      expect(going.stamp.clipped).toBe(false);
      expect(going.stamp.x).toBeCloseTo(seen(rolled).x, 6);
      expect(going.stamp.y).toBeCloseTo(seen(rolled).y, 6);
      expect(going.stamp.y).toBeGreaterThan(last);
      last = going.stamp.y;
    }
    expect(under.stamp.clipped).toBe(false);
    // Once it is down it stands on the lower table in front of the foot, where the catcher has it and not where the engine
    // has it yet: its middle is out past the foot, so it is drawn over the catcher, whole, as a ball standing there is.
    const down = rolling(ball(front + MEDAL_RADIUS, CATCHER.slide + 0.05), BALL_RADIUS, machine.time);
    if (down?.leg !== 'table') throw new Error('it is not on the table');
    expect(down.depth).toBeGreaterThan(front + CATCHER.foot.out);
    const standing = order(ball(front + MEDAL_RADIUS, CATCHER.slide + 0.05));
    expect(standing.ball).toBeGreaterThan(standing.catcher);
    expect(standing.stamp.clipped).toBe(false);
    expect(standing.stamp.x).toBeCloseTo(seen(down).x, 6);
    expect(standing.stamp.y).toBeCloseTo(seen(down).y, 6);
    expect(standing.stamp.y).toBeGreaterThan(last);
    // When the engine has it there, it is where the engine has it, like any ball.
    const handed = order(ball(down.depth + 1, CATCHER.slide + 0.05));
    expect(handed.stamp.y).toBeCloseTo(project(50, BALL_RADIUS, down.depth + 1).y, 6);
  });

  it('draws two balls at the catcher the nearer one last, whichever of them the machine holds first', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = 1.5;
    const front = pusherFront(machine.time);
    // Balls that came over the lip long ago, unless it is said when: they lie where the engine has them.
    const ball = (id: number, x: number, y: number, sinceDrop = 30): Medal => ({ id, x, y, level: 0, tier: 0, sinceDrop, stack: 1, ball: true, grown: 1 });
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
    // And two that have only just come over the lip at the catcher and are rolling down its slide: the nearer one
    // further down it, and then two as far down it as each other, which are told apart by where the machine has them.
    const dropping = [ball(907, 44, front + MEDAL_RADIUS, 0.05), ball(906, 56, front + MEDAL_RADIUS + 2, 0.3)];
    const abreast = [ball(909, 44, front + MEDAL_RADIUS, 0.05), ball(908, 56, front + MEDAL_RADIUS + 2, 0.05)];
    for (const one of [...dropping, ...abreast]) expect(rolling(one, BALL_RADIUS, machine.time)).not.toBeNull();
    for (const pair of [standing, dropping, abreast]) {
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
      const { screen, stage, machine } = frame([stone, plain(9, 20, 60)], { calm: true });
      const spot = lyingJewel(stone, machine.time);
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
    // The arrows down into the tray keep clear of it: none is drawn where the plate is. There is one to either side of
    // it, in the tray's stretch of the front, and none under the corners, which are the side holes' mouths.
    const starts = made.flatMap((canvas) => canvas.starts);
    const arrowsOn = (from: number, to: number) => starts.filter((point) => Math.abs(point.y - project(50, -7.5, D).y) < 0.5 && point.x > project(from, -7.5, D).x && point.x < project(to, -7.5, D).x).length;
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
    machine.medals = [{ id: 900, x: 50, y: depth, level: 1, tier: 0, sinceDrop: -1, stack, ball: false, grown: 1 }];
    const screen = recorder();
    drawField(screen.context, stage, machine, { showGuide: false, calm: true });
    return { screen, stage, depth };
  };

  it('stands as tall as its medals are thick, with a line between one medal and the next that is thinner than a medal', () => {
    for (const stack of [3, 12, TOWER.max]) {
      const { screen, stage, depth } = frame(stack);
      const foot = project(50, P + T, depth);
      const head = project(50, P + stack * T, depth);
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
      const one = foot.y - project(50, P + T * 2, depth).y;
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
      machine.medals = [{ id: 900, x: 50, y: depth, level: 1, tier: 0, sinceDrop: -1, stack: 30, ball: false, grown: 1 }];
      // The medals on the pusher are drawn without a tower an arm is pushing, which is drawn with its arm.
      if (armed) machine.stacker.tubes[0] = { ...idleTube(), phase: 'pushing', clock: STACK.pushes * 0.6, tower: 900 };
      const screen = recorder();
      drawField(screen.context, stage, machine, { showGuide: false, calm: true });
      const faces = screen.stamps.filter((stamp) => stage.faces.includes(stamp.image as HTMLCanvasElement) || stamp.image === stage.medal);
      for (const height of [P + T, P + 30 * T]) {
        const at = project(50, height, depth);
        expect(faces.filter((stamp) => Math.hypot(stamp.x - at.x, stamp.y - at.y) < 1e-6), `${armed ? 'on an arm' : 'free'}, at ${height}`).toHaveLength(1);
      }
    }
  });

  it('stands four and a half medals’ widths high at its tallest, as tall as a tower can stand under the feed arms', () => {
    expect(TOWER.max * T).toBeGreaterThan(MEDAL_RADIUS * 2 * 4.4);
    expect(TOWER.max * T).toBeLessThan(MEDAL_RADIUS * 2 * 4.7);
    // And on a phone, where the stage is 345 pixels wide, that is a column some forty pixels high: plainly a tower over a pile two deep.
    const depth = pusherFront(0) - 12;
    const tall = (project(50, P + T, depth).y - project(50, P + TOWER.max * T, depth).y) * (345 / VIEW.width);
    expect(tall).toBeGreaterThan(36);
    expect(tall).toBeGreaterThan(10 * (project(50, P, depth).y - project(50, P + T * 2, depth).y) * (345 / VIEW.width));
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

describe('the well under the lip on the canvas', () => {
  it('is all but black, as the 3D picture has it, with a trace of blue that the black of a throat’s floor has not', () => {
    const rgb = (colour: string): number[] => [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
    const light = ([r, g, b]: number[]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const [lip, edge] = WELL_SHADE.map(rgb);
    for (const [r, g, b] of [lip, edge]) {
      // Read off a film of the 3D picture, the well is about 9, 7, 12 in 255. This is no lighter than half as light again as that.
      expect(light([r, g, b])).toBeLessThan(light([9, 7, 12]) * 1.5);
      expect(light([r, g, b])).toBeGreaterThan(light([9, 7, 12]) * 0.75);
      // And it is told from a throat's floor by its blue, which the picture is read back by (the e2e START check).
      expect(Math.max(r, g)).toBeLessThan(16);
      expect(b).toBeGreaterThanOrEqual(24);
      expect(b - r).toBeGreaterThanOrEqual(12);
    }
    expect(SLOT_THROAT.floor).toBe('#000000');
    // Darker the further down it is.
    expect(light(edge)).toBeLessThan(light(lip));
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
