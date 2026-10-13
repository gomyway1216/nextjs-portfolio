import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARMS, SLOT, armCollar, armStart, armTip, fedSpot, legOf, letGo, railFrame, rollingSpot, slotSpot } from '@/components/game/MedalPusher/arms';
import {
  APRON,
  CATCHER,
  SLOPE,
  START_SLOT,
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
  PUSHER,
  ROLL_TIME,
  createMachine,
  dropJewel,
  luckySlot,
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
  SLOT_LIGHT,
  SLOT_SHAPE,
  ageStage,
  celebrate,
  createStage,
  drawField,
  goldFlash,
  lightGate,
  showJewel,
  trackMedals,
  type DrawOptions,
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
 * An outline as it was filled: the colour it was filled with (none, if it was a gradient), how much of it shows
 * through, the points its straight edges go through, the circles in it, each by its middle and how big it is on
 * the drawing, and whether the canvas was drawing only inside some other outline.
 */
interface Fill {
  style: string;
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
 * image by its place among the stamps. It keeps the transform as a canvas
 * does, through `save` and `restore` too.
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
    beginPath: () => {
      outline = { points: [], rounds: [] };
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
      fills.push({ style, alpha, points: [...outline.points], rounds: [...outline.rounds], clipped });
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
  return { context, texts, starts, lines, stamps, arcs, rects, fills, log };
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
   * upper edge of its opening and its lamp, each as it was filled; how big a field unit is at the lamp; and whether
   * the floor of its throat was washed with light.
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
      // The glow of a lit slot is a round of light with its middle over the middle of the opening.
      const middle = mouthOnDrawing(pocket, machine.time, options.wings);
      const glows = screen.fills.filter((fill) => fill.points.length === 0 && fill.rounds.length === 1 && Math.hypot(fill.rounds[0].x - middle.x, fill.rounds[0].y - middle.y) < 1e-6);
      return {
        glows: glows.map((fill) => ({ keptOut: fill.clipped })),
        frame: { style: top.style, alpha: top.alpha },
        ring: { style: ring.style, alpha: ring.alpha },
        lamp: { style: lamp.style, alpha: lamp.alpha, r: lamp.rounds[0].r },
        lampScale: spot.scale,
        wash: floors.length > 1,
      };
    });
  };

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
        expect(mouth.wide * PHONE).toBeGreaterThan(20);
        expect(mouth.tall * PHONE).toBeGreaterThan(9);
        // As wide inside as a medal that just fits, and the whole of it, frame and all, below the lip.
        expect(mouth.wide).toBeCloseTo((MEDAL_RADIUS + CHECKERS.halfWidth) * 2 * seen(slopeSpot(spot.x, CATCHER.back + START_SLOT.long / 2, time, CATCHER.rim.high)).scale, 9);
        expect(outer[0].y).toBeGreaterThan(project(spot.x, P, pusherFront(time)).y);
        // Down inside it, and only inside it: the floor of the throat, dark, over the whole opening.
        const floors = through(screen, opening).filter((fill) => fill.points.length === 4 && fill.style === '#000000');
        expect(floors).toHaveLength(1);
        expect(floors[0].clipped).toBe(true);
        // Over that, the far wall, from under the ring of light down to the floor, which is what gives the hole its depth: its foot is well down the opening, and there is floor to be seen under it.
        const walls = through(screen, wall).filter((fill) => fill.points.length === 4);
        expect(walls).toHaveLength(1);
        expect(walls[0].clipped).toBe(true);
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

  it('is one piece: a slide from under the lip down to its foot, as long as the three pockets take, with the strip of words on the last of it', () => {
    fakeDocument();
    for (const time of TIMES) {
      const front = pusherFront(time);
      const screen = frame(time, false);
      const { starts, lines } = screen;
      // The board itself: one outline, from the lip's foot to the catcher's own foot, from end to end.
      const board = [slopeSpot(CATCHER.from, 0, time), slopeSpot(CATCHER.to, 0, time), slopeSpot(CATCHER.to, SLOPE.long, time), slopeSpot(CATCHER.from, SLOPE.long, time)].map(seen);
      expect(through(screen, board).filter((fill) => fill.points.length === 4).length).toBeGreaterThanOrEqual(1);
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

  it('gives each slot its own colour while it waits, and lights the one the lucky lamp is on gold, steadily: its frame, its ring and its lamp, which is bigger', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    expect(new Set(SLOT_LIGHT.own).size).toBe(CHUCKERS.count);
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
        // Nothing flashes over a slot nobody has put a medal down, and the floor of every throat is dark: the lit
        // slot's glow is round its opening and kept out of it, and a slot that waits has no glow at all.
        look.forEach((slot, pocket) => {
          expect(slot.wash).toBe(false);
          expect(slot.glows).toEqual(pocket === lucky ? [{ keptOut: true }] : []);
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
    // The others are as they were: the lucky one gold, the third waiting in its own colour.
    expect(lit[lucky].frame.style).toBe(SLOT_LIGHT.gold);
    expect(lit[lucky].wash).toBe(false);
    expect(lit[idle].frame.style).toBe(SLOT_LIGHT.idle);
    expect(lit[idle].lamp.style).toBe(SLOT_LIGHT.own[idle]);
    expect(lit[idle].wash).toBe(false);
    // Half way through it is still lit; when the time is up it is a slot that waits again. It is lit once for a medal, not on and off.
    ageStage(stage, GLOW_TIME / 2);
    expect(slotLooks(stage, machine, { showGuide: false })[gate].frame.style).toBe(SLOT_LIGHT.flash);
    ageStage(stage, GLOW_TIME / 2 + 0.01);
    const after = slotLooks(stage, machine, { showGuide: false });
    expect(after[gate].frame.style).toBe(SLOT_LIGHT.idle);
    expect(after[gate].lamp.style).toBe(SLOT_LIGHT.own[gate]);
    expect(after[gate].wash).toBe(false);
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
    const medal = (sinceDrop: number): Medal => ({ id, x, y: front + MEDAL_RADIUS, level: 0, tier: 0, sinceDrop, stack: 1, grow: 0, ball: false, grown: 1 });
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

  it('draws a medal on its way into its slot lying on the slide with its face up and then nosing into the opening, darker as it goes, and not among the medals on the table', () => {
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
      // One picture of it, in full, with its middle where the catcher has it, after the catcher, and nothing where the engine has it lying.
      expect(stamps).toHaveLength(1);
      const at = seen(held);
      expect(stamps[0].x).toBeCloseTo(at.x, 6);
      expect(stamps[0].y).toBeCloseTo(at.y, 6);
      expect(stamps[0].alpha).toBe(1);
      expect(after).toBe(true);
      // Tipped as the catcher has it: the edge of the picture goes through where its nose is.
      expect(reach(stamps[0], seen(nose(held)))).toBeCloseTo(1, 1);
      // On the slide it is seen whole. In the slot, what of it is under the slide is seen only down the opening.
      expect(stamps[0].clipped).toBe(held.leg === 'slot');
      // The less light it gets the darker it is: a dark wash over its face, as strong as the light is weak. It is never fainter.
      const washes = screen.fills.filter((fill) => fill.style === '#1c0f02');
      expect(washes).toHaveLength(held.light < 1 ? 1 : 0);
      const dark = washes.length ? washes[0].alpha : 0;
      expect(dark).toBeCloseTo(1 - held.light, 9);
      expect(dark).toBeGreaterThanOrEqual(last.dark);
      // It goes down the drawing as it goes down the slide.
      expect(stamps[0].y).toBeGreaterThan(last.y - 1e-9);
      last = { y: stamps[0].y, dark };
      legs.add(held.leg);
    }
    expect([...legs]).toEqual(['slide', 'slot']);
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
  });

  it('draws a medal that came over between the slots sliding down the slide in full view and going off its foot, as the 3D picture does', () => {
    fakeDocument();
    // Half way between two slots: over the lip at the catcher, and through neither.
    const x = (CHECKERS.positions[0] + CHECKERS.positions[1]) / 2;
    const { machine, front, medal, drawn } = lone(902, x);
    const legs = new Set<string>();
    let last = -Infinity;
    for (let sinceDrop = 0.01; sinceDrop < CATCHER.slide; sinceDrop += 1 / 60) {
      const held = caught(medal(sinceDrop), machine.time);
      if (!held) throw new Error('not held');
      expect(held.chucker).toBe(-1);
      const { stamps, after } = drawn(sinceDrop);
      // One picture of it: where the catcher has it and tipped as it has it, after the catcher and the pusher's top.
      expect(stamps).toHaveLength(1);
      const at = seen(held);
      expect(stamps[0].x).toBeCloseTo(at.x, 6);
      expect(stamps[0].y).toBeCloseTo(at.y, 6);
      expect(reach(stamps[0], seen(nose(held)))).toBeCloseTo(1, 1);
      expect(after).toBe(true);
      // On the slide it is seen whole; off the foot, only as far as it still stands over the medals on the lower table.
      expect(stamps[0].clipped).toBe(held.leg === 'foot');
      // It goes down the drawing all the way.
      expect(stamps[0].y).toBeGreaterThan(last);
      last = stamps[0].y;
      legs.add(held.leg);
    }
    expect([...legs]).toEqual(['slide', 'foot']);
    // Lying on the slide, which leans toward the player, its face is rounder on the drawing than that of a medal lying level there.
    const half = caught(medal(CATCHER.slide / 2), machine.time);
    if (!half) throw new Error('not held');
    const [lean] = drawn(CATCHER.slide / 2).stamps;
    expect(lean.height / lean.width).toBeGreaterThan(seen(half).tilt * 1.2);
    // Once it is down it is a medal on the lower table again, under the catcher, drawn before the catcher is.
    const lying = drawn(CATCHER.slide + 0.01);
    expect(lying.stamps).toHaveLength(1);
    expect(lying.stamps[0].clipped).toBe(false);
    expect(lying.after).toBe(false);
    const where = project(x, HEIGHT.medal, front + MEDAL_RADIUS);
    expect(lying.stamps[0].x).toBeCloseTo(where.x, 6);
    expect(lying.stamps[0].y).toBeCloseTo(where.y, 6);
  });

  it('draws a medal that has caught a slot’s frame lying on it in full view, rocking from side to side, and not at all with motion reduced', () => {
    fakeDocument();
    const x = CHECKERS.positions[1] + CHECKERS.halfWidth + CATCHER.reach / 2;
    const { machine, medal, drawn } = lone(903, x);
    /** How much lower on the drawing the right-hand end of a medal's picture is than its middle. */
    const droop = (stamp: Stamp): number => (stamp.across[0] * stamp.across[1] + stamp.down[0] * stamp.down[1]) / Math.hypot(stamp.across[0], stamp.down[0]);
    const droops: number[] = [];
    for (let sinceDrop = 0.005; sinceDrop < CATCHER.rattle; sinceDrop += 1 / 120) {
      const held = caught(medal(sinceDrop), machine.time);
      if (!held) throw new Error('not held');
      expect(held.near).toBe(1);
      const { stamps, after } = drawn(sinceDrop);
      // One picture of it, where the catcher has it, after the catcher, whole until it goes off the foot.
      expect(stamps).toHaveLength(1);
      const at = seen(held);
      expect(stamps[0].x).toBeCloseTo(at.x, 6);
      expect(stamps[0].y).toBeCloseTo(at.y, 6);
      expect(after).toBe(true);
      expect(stamps[0].clipped).toBe(held.leg === 'foot');
      if (held.leg !== 'frame') continue;
      // Rocked as the catcher has it: the side of it that is up in the cabinet is up on the drawing. Its right-hand
      // end is where the right-hand end of a medal rocked that far about the line down the slide is.
      const sway = Math.sin(held.heading) * Math.sin(held.tilt);
      const along = Math.sqrt(1 - sway * sway);
      const lean = Math.cos(held.heading) * Math.sin(held.tilt);
      const right = { x: held.x + MEDAL_RADIUS * along, height: held.height + (MEDAL_RADIUS * sway * Math.cos(held.tilt)) / along, depth: held.depth + (MEDAL_RADIUS * sway * lean) / along };
      expect(reach(stamps[0], seen(right))).toBeCloseTo(1, 1);
      expect(droop(stamps[0])).toBeCloseTo(seen(right).y - at.y, 0);
      droops.push(droop(stamps[0]));
    }
    // It is seen rocking for a good many frames, both ways, by more than a pixel of the drawing each way.
    expect(droops.length).toBeGreaterThan(30);
    expect(Math.max(...droops)).toBeGreaterThan(1.5);
    expect(Math.min(...droops)).toBeLessThan(-1.5);
    // With motion reduced it never rocks: it lies on the slide, level across, all the way down.
    for (let sinceDrop = 0.005; sinceDrop < CATCHER.slide * 0.8; sinceDrop += 1 / 30) {
      const still = caught(medal(sinceDrop), machine.time, true);
      if (!still) throw new Error('not held');
      const { stamps } = drawn(sinceDrop, { calm: true });
      expect(stamps).toHaveLength(1);
      expect(stamps[0].x).toBeCloseTo(seen(still).x, 6);
      expect(stamps[0].y).toBeCloseTo(seen(still).y, 6);
      expect(Math.abs(droop(stamps[0]))).toBeLessThan(0.5);
    }
  });

  it('draws a ball that lies under the catcher before the catcher, which covers it, one that has come out from under it after, and one that has just come over the lip rolling down the slide', () => {
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
