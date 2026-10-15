/**
 * The drawings on the instruction plate: this cabinet's own parts, as a
 * printer's line art.
 *
 * Every part is put where the cabinet's camera puts it (`project` in
 * view.ts), from the same measures the machine is built from: the pusher's
 * stroke, the START plate and its three holes, the rails and their slots,
 * the screen in the back wall. A drawing is a window on that picture, so the
 * plate shows the machine the player is looking at, and follows it when it is
 * rebuilt. The START holes in particular are whatever catcher.ts says they
 * are on the drawing (`startMouths`): openings with square corners in the
 * plate that leans down from the pusher's lip, which a medal slides into,
 * lying flat. A mouth that is handed in as a round hole is drawn round, and
 * one that is a slit as a slit with the medal going down it on its edge.
 *
 * They are drawn the way a card is printed: flat inks under a black key
 * line, the colour a hair out of register with the line, and shade laid on
 * as a screen of dots.
 */

import { Fragment, type ReactNode } from 'react';
import { HATCH, SLOT, armCollar, armTip } from './arms';
import { CATCHER, SIGN, SLOPE, mouthOnDrawing, mouthSpot, signSpot, slopeSpot, slotCorners } from './catcher';
import { ARM_REACH, CHECKERS, FIELD, LANDING, MEDAL_RADIUS, MEDAL_THICKNESS, PUSHER, armStart, type Arm } from './engine';
import type { Bonus } from './lottery';
import type { PlateRules, StepId } from './plateData';
import { PLATE_SILVER } from './medalLook';
import { ReelSymbol } from './ReelSymbols';
import { BOWL_SHAPE } from './screen';
import { SIDE_HOLE, acrossAt } from './sidehole';
import { HEIGHT, HOLD_LAMPS, HOUSING, SCREEN, project, rise } from './view';
import styles from './InstructionPlate.module.css';

/** The inks the plate is printed in. */
export const INK = {
  key: '#1f1830',
  white: '#fffdf4',
  gold: '#f5b91f',
  goldLight: '#ffe58a',
  goldDark: '#b3740a',
  /** A medal's inks: medals are copper-nickel, and only what is lit is gold (medalLook.ts). */
  silver: PLATE_SILVER.face,
  silverLight: PLATE_SILVER.light,
  silverDark: PLATE_SILVER.dark,
  magenta: '#d8246f',
  pink: '#f59ac0',
  purple: '#4c2ea3',
  purpleDark: '#2b1866',
  lilac: '#b9aaec',
  cyan: '#93d6ef',
  cyanLight: '#cdeefa',
  red: '#e2222e',
  green: '#12964a',
  steel: '#c8cee0',
} as const;

const W = FIELD.width;
/** Where the pusher's lip is drawn: half way along its stroke. */
const LIP = (PUSHER.min + PUSHER.max) / 2;
const P = HEIGHT.pusher;

type V3 = readonly [x: number, height: number, depth: number];

const n = (value: number): string => String(Math.round(value * 10) / 10);
const xy = (x: number, height: number, depth: number): [number, number] => {
  const point = project(x, height, depth);
  return [point.x, point.y];
};
const at = (corner: V3): string => xy(...corner).map(n).join(' ');
/** A closed outline through points of the cabinet. */
const outline = (...corners: V3[]): string => `M${corners.map(at).join('L')}Z`;
/** An ellipse as a path. */
const oval = (cx: number, cy: number, rx: number, ry: number = rx): string =>
  `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`;
/** A rectangle, with rounded corners if `r` is given, as a path. */
const box = (x: number, y: number, width: number, height: number, r = 0): string =>
  r === 0
    ? `M${n(x)} ${n(y)}h${n(width)}v${n(height)}h${n(-width)}Z`
    : `M${n(x + r)} ${n(y)}h${n(width - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(height - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(-(width - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}v${n(-(height - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}Z`;

/**
 * A fat arrow from one point to another: a shaft `width` thick and a head
 * more than twice as wide. It is an outline, so it takes a key line like any shape.
 */
export function arrow(x1: number, y1: number, x2: number, y2: number, width: number): string {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const head = Math.min(length * 0.62, width * 2.1);
  const neck = length - head;
  /** The point `along` the arrow from its tail and `across` it to the left. */
  const point = (along: number, across: number) => `${n(x1 + ux * along + uy * across)} ${n(y1 + uy * along - ux * across)}`;
  const half = width / 2;
  return `M${point(0, half)}L${point(neck, half)}L${point(neck, width * 1.15)}L${point(length, 0)}L${point(neck, -width * 1.15)}L${point(neck, -half)}L${point(0, -half)}Z`;
}

/** One printed shape: an outline, the ink it is filled with, and how heavy its key line is, in key widths (0 for none). */
interface Shape {
  d: string;
  fill?: string;
  line?: number;
  /** The ink of its line, where that is not the key. */
  ink?: string;
  /** How long its line's dashes are, in key widths, if it is dashed. */
  dash?: number;
  /** Printed in one pass, colour and line together: for the small things there are many of. */
  flat?: boolean;
}

/**
 * Prints shapes in order, each as its colour and then its line. The colour is
 * laid a little down and to the right of the line, as on a sheet whose
 * colours were not quite in register with its key.
 */
const Print = ({ shapes, k }: { shapes: Shape[]; k: number }) => (
  <>
    {shapes.map((shape, index) =>
      shape.flat ? (
        <path key={index} d={shape.d} fill={shape.fill} strokeWidth={n(k * (shape.line ?? 1))} />
      ) : (
        <Fragment key={index}>
          {shape.fill && <path d={shape.d} fill={shape.fill} stroke="none" transform={`translate(${n(k * 0.42)} ${n(k * 0.3)})`} />}
          {shape.line !== 0 && (
            <path d={shape.d} stroke={shape.ink} strokeWidth={n(k * (shape.line ?? 1))} strokeDasharray={shape.dash ? `${n(k * shape.dash)} ${n(k * shape.dash * 0.9)}` : undefined} />
          )}
        </Fragment>
      ),
    )}
  </>
);

/** A screen of dots, for shade: its id, and the pattern to put in a drawing's `defs`. */
const toneId = (art: string): string => `gf-plate-tone-${art}`;
const Tone = ({ art, k }: { art: string; k: number }) => (
  <pattern id={toneId(art)} width={n(k * 2.6)} height={n(k * 2.6)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <circle cx={n(k * 1.3)} cy={n(k * 1.3)} r={n(k * 0.62)} fill={INK.key} fillOpacity="0.34" />
  </pattern>
);
const tone = (art: string): string => `url(#${toneId(art)})`;

// ── The parts of the cabinet ────────────────────────────────────────────────

/** How far under the front edge the plate shows the cabinet's front and the side holes' mouths, and how wide the red edge over a mouth is printed. */
const FRONT_DROP = 9;
const HOLE_EDGE = 1.8;

/**
 * A side hole's mouth under the front edge at a corner, where the cabinet has
 * it (sidehole.ts): the dark of the hole from the side of the table to the
 * tray's cheek, the red edge that warns of it, and the cheek. The plate is a
 * print, and leaves the ball rail across the mouth out.
 */
export function holeMouth(side: number): Shape[] {
  const D = FIELD.depth;
  const from = side < 0 ? 0 : W;
  const hole = acrossAt(SIDE_HOLE.reach - SIDE_HOLE.cheek, side);
  const tray = acrossAt(SIDE_HOLE.reach + SIDE_HOLE.cheek, side);
  return [
    { d: outline([from, 0, D], [hole, 0, D], [hole, -FRONT_DROP, D], [from, -FRONT_DROP, D]), fill: INK.key },
    { d: outline([from, 0, D - HOLE_EDGE], [hole, 0, D - HOLE_EDGE], [hole, 0, D], [from, 0, D]), fill: INK.red, line: 0.8 },
    { d: outline([hole, 0, D], [tray, 0, D], [tray, -FRONT_DROP, D], [hole, -FRONT_DROP, D]), fill: INK.steel },
  ];
}

/**
 * The lower table, from the foot of the pusher to the front edge, and the
 * cabinet's front under it: the tray's stretch in the middle, between its
 * cheeks, and a side hole's mouth at each corner.
 */
function table(art: string): Shape[] {
  const tray: [number, number] = [SIDE_HOLE.reach + SIDE_HOLE.cheek, W - SIDE_HOLE.reach - SIDE_HOLE.cheek];
  const front = outline([tray[0], 0, FIELD.depth], [tray[1], 0, FIELD.depth], [tray[1], -FRONT_DROP, FIELD.depth], [tray[0], -FRONT_DROP, FIELD.depth]);
  return [
    { d: outline([0, 0, LIP], [W, 0, LIP], [W, 0, FIELD.depth], [0, 0, FIELD.depth]), fill: INK.cyan },
    { d: front, fill: INK.purpleDark },
    { d: front, fill: tone(art), line: 0 },
    ...holeMouth(-1),
    ...holeMouth(1),
  ];
}

/** The pusher: its top, back to the wall, and its face down to the lower table. */
function pusher(art: string): Shape[] {
  const face = outline([0, P, LIP], [W, P, LIP], [W, 0, LIP], [0, 0, LIP]);
  return [
    { d: outline([0, P, 0], [W, P, 0], [W, P, LIP], [0, P, LIP]), fill: INK.cyanLight },
    { d: face, fill: INK.steel },
    { d: face, fill: tone(art), line: 0 },
  ];
}

/** The side walls, as far forward as they go: past them the table's sides are open. */
const sides = (art: string): Shape[] =>
  [0, W].flatMap((x) => {
    const side = outline([x, 0, 0], [x, 0, FIELD.sideOpenFrom], [x, HEIGHT.sideWall, FIELD.sideOpenFrom], [x, HEIGHT.top, 0]);
    return [
      { d: side, fill: INK.purple },
      { d: side, fill: tone(art), line: 0 },
    ];
  });

/** The back wall under the screen, with the shelf that carries the hold's lamps. */
function wall(art: string): Shape[] {
  const panel = outline([0, P, 0], [W, P, 0], [W, HOUSING.shelf, 0], [0, HOUSING.shelf, 0]);
  return [
    { d: panel, fill: INK.purple },
    { d: panel, fill: tone(art), line: 0 },
    { d: outline([0, HOUSING.shelf, 0], [W, HOUSING.shelf, 0], [W, SCREEN.foot, 0], [0, SCREEN.foot, 0]), fill: INK.gold },
  ];
}

/** The hold's lamps on the shelf: one for each spin the machine holds, the first `lit` of them on. */
const holdLamps = (hold: number, lit: number): Shape[] =>
  Array.from({ length: hold }, (_unused, index) => {
    const spot = project(HOLD_LAMPS.first + index * HOLD_LAMPS.step, (HOUSING.shelf + SCREEN.foot) / 2, HOUSING.ledge);
    return { d: oval(spot.x, spot.y, HOLD_LAMPS.radius * spot.scale * 1.25), fill: index < lit ? INK.red : INK.white, line: 0.7, flat: true };
  });

/** The screen in the back wall, with the strips of light beside it and the hood over it. */
function housing(art: string): Shape[] {
  const under = outline([0, HOUSING.hood, HOUSING.out], [W, HOUSING.hood, HOUSING.out], [W, HOUSING.hood, 0], [0, HOUSING.hood, 0]);
  return [
    { d: outline([0, SCREEN.foot, 0], [W, SCREEN.foot, 0], [W, HEIGHT.top, 0], [0, HEIGHT.top, 0]), fill: INK.gold },
    { d: outline([SCREEN.left, SCREEN.foot, 0], [SCREEN.right, SCREEN.foot, 0], [SCREEN.right, SCREEN.top, 0], [SCREEN.left, SCREEN.top, 0]), fill: INK.purpleDark },
    { d: under, fill: INK.goldDark },
    { d: under, fill: tone(art), line: 0 },
    { d: outline([0, HOUSING.hood, HOUSING.out], [W, HOUSING.hood, HOUSING.out], [W, HEIGHT.top, HOUSING.out], [0, HEIGHT.top, HOUSING.out]), fill: INK.goldLight },
  ];
}

/** A feed arm's rail, from the slot at its front corner to its tip, which is over `tipX`. A `ghost` is where it could point instead. */
function rail(arm: Arm, tipX: number = armStart(arm), ghost = false): Shape[] {
  const collar = armCollar(arm);
  const tip = armTip(arm, tipX);
  const d = `M${at([collar.x, collar.height, collar.depth])}L${at([tip.x, tip.height, tip.depth])}`;
  if (ghost) return [{ d, line: 0.9, dash: 2.2 }];
  return [
    { d, line: 4.4 },
    { d, line: 2.6, ink: INK.lilac },
  ];
}
/** The slot at the near end of a rail: its ring, the light inside it, and the mouth a medal goes in at. */
function slot(arm: Arm): Shape[] {
  const collar = armCollar(arm);
  const face = project(collar.x, collar.height, collar.depth);
  const ring = SLOT.ring * face.scale;
  return [
    { d: oval(face.x, face.y, ring), fill: INK.white },
    { d: oval(face.x, face.y, ring * SLOT.light), fill: INK.cyan, line: 0.7 },
    { d: oval(face.x, face.y, ring * SLOT.throat * 0.82), fill: INK.purpleDark, line: 0.7 },
    { d: box(face.x - ring * 0.12, face.y - ring * 0.5, ring * 0.24, ring, ring * 0.12), fill: INK.key, line: 0 },
  ];
}

/** When the pusher's lip is half way along its stroke, which is where the plate draws it. */
const MID_STROKE = PUSHER.period / 4;

/** A point of a drawing. */
type Point = readonly [x: number, y: number];

/**
 * The mouth of a START pocket as catcher.ts has it on the cabinet's drawing:
 * the middle of its opening and how wide and how tall the opening is there,
 * in that drawing's pixels, with the lip half way along its stroke. `rim` is
 * how far its frame stands out round it.
 *
 * The plate's own are holes: openings with square corners in the plate,
 * which leans toward the player. `pocket` holds the corners of such an
 * opening on the drawing, and of the frame round it: the upper edge from the
 * left, and then the lower from the right. A mouth without them is drawn from
 * its measures: `round` says whether it is a round hole, which is seen as an
 * oval, or a slit.
 */
export interface Mouth {
  x: number;
  y: number;
  wide: number;
  tall: number;
  rim: number;
  round: boolean;
  pocket?: { opening: readonly Point[]; frame: readonly Point[] };
}

/** The mouths of the START pockets, from the left. Everything the plate draws of them is drawn from this. */
export function startMouths(): Mouth[] {
  return CHECKERS.positions.map((_x, chucker) => {
    const spot = mouthSpot(chucker, MID_STROKE);
    const seen = project(spot.x, spot.height, spot.depth);
    const mouth = mouthOnDrawing(chucker, MID_STROKE);
    // The opening, and the outer edge of the frame let in round it, as the cabinet's own drawing has them.
    const corners = (grow: number, wide = false): Point[] => slotCorners(chucker, MID_STROKE, wide, grow).map((corner) => xy(corner.x, corner.height, corner.depth));
    return { ...mouth, rim: CATCHER.rim.wide * seen.scale, round: false, pocket: { opening: corners(0), frame: corners(CATCHER.rim.wide, true) } };
  });
}

/**
 * The outline of a mouth, or with `grow` of what stands round it: a pocket's
 * opening and its frame, corner to corner; an oval for a round hole; and a
 * slit with round ends for a slit. The last two are `grow` larger all round.
 */
export const mouthOutline = (mouth: Mouth, grow = 0): string =>
  mouth.pocket
    ? `M${(grow > 0 ? mouth.pocket.frame : mouth.pocket.opening).map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`
    : mouth.round
      ? oval(mouth.x, mouth.y, mouth.wide / 2 + grow, mouth.tall / 2 + grow * (mouth.tall / mouth.wide))
      : box(mouth.x - mouth.wide / 2 - grow, mouth.y - mouth.tall / 2 - grow, mouth.wide + grow * 2, mouth.tall + grow * 2, Math.min(mouth.wide, mouth.tall) / 2 + grow);

/** How a medal goes down a mouth: sliding into a pocket, lying flat into a round hole, and standing on its edge into a slit. */
export const dropPose = (mouth: Mouth): 'slide' | 'flat' | 'edge' => (mouth.pocket ? 'slide' : mouth.round ? 'flat' : 'edge');

/** A point of the START plate with the lip half way along its stroke: `x` across the field and `down` the plate from the lip. */
const onSlide = (x: number, down: number, lift = 0): V3 => {
  const spot = slopeSpot(x, down, MID_STROKE, lift);
  return [spot.x, spot.height, spot.depth];
};

/**
 * The START plate hung under the pusher's lip: the board, which leans from the
 * lip down toward the player, with the START holes in it, each in its gold
 * frame; and to either side of the holes a START sign.
 */
function catcher(art: string, mouths: readonly Mouth[]): Shape[] {
  const { from, to } = CATCHER;
  const top = outline(onSlide(from, 0), onSlide(to, 0), onSlide(to, SLOPE.long), onSlide(from, SLOPE.long));
  const sign = (side: number): string => {
    const at = (across: number, down: number): V3 => {
      const spot = signSpot(side, across, down, MID_STROKE);
      return [spot.x, spot.height, spot.depth];
    };
    return outline(at(0, 0), at(SIGN.wide, 0), at(SIGN.wide, SIGN.long), at(0, SIGN.long));
  };
  return [
    { d: top, fill: INK.white },
    { d: top, fill: tone(art), line: 0 },
    { d: sign(-1), fill: INK.magenta },
    { d: sign(1), fill: INK.magenta },
    ...mouths.flatMap((mouth) => [
      { d: mouthOutline(mouth, mouth.rim), fill: INK.gold },
      { d: mouthOutline(mouth), fill: INK.key, line: 0 },
    ]),
  ];
}
/** The word on each of the two START signs. */
const StartWords = ({ size }: { size: number }) => (
  <>
    {[-1, 1].map((side) => {
      const spot = signSpot(side, SIGN.wide / 2, SIGN.long * 0.42, MID_STROKE);
      const [cx, cy] = xy(spot.x, spot.height, spot.depth);
      return (
        <text key={side} className={styles.artWord} x={n(cx)} y={n(cy + size * 0.36)} fontSize={n(size)} textAnchor="middle" fill={INK.white} stroke={INK.key} strokeWidth={n(size * 0.2)}>
          START
        </text>
      );
    })}
  </>
);

/** A medal lying flat: on the lower table, or on the pusher when `up`. `sink` moves it down the drawing, for one that is falling. */
function medal(x: number, depth: number, up = false, sink = 0): Shape[] {
  const spot = project(x, (up ? P : 0) + HEIGHT.medal, depth);
  const rx = MEDAL_RADIUS * spot.scale;
  const ry = rx * spot.tilt;
  // Its rim shows under its face: as much of it as the camera sees of a medal's thickness there.
  const rim = HEIGHT.medal * rise(spot);
  return [
    { d: oval(spot.x, spot.y + sink + rim, rx, ry), fill: INK.silverDark, line: 0.8, flat: true },
    { d: oval(spot.x, spot.y + sink, rx, ry), fill: INK.silver, line: 0.8, flat: true },
    { d: oval(spot.x, spot.y + sink, rx * 0.62, ry * 0.62), fill: INK.silverLight, line: 0 },
  ];
}
const medals = (spots: readonly (readonly [number, number])[], up = false): Shape[] => spots.flatMap(([x, depth]) => medal(x, depth, up));

/** A medal standing on its edge, as it goes in at a slot or rolls along a rail: `size` from its middle to its rim. */
const coin = (cx: number, cy: number, size: number, lean = 0.42): Shape[] => [
  { d: oval(cx, cy, size * lean, size), fill: INK.silver, line: 0.8, flat: true },
  { d: oval(cx, cy, size * lean * 0.55, size * 0.62), fill: INK.silverLight, line: 0 },
];

/** A cross in a disc: what is lost, or what ends a run. */
function lostMark(cx: number, cy: number, r: number): Shape[] {
  const arm = r * 0.42;
  const stroke = `M${n(cx - arm)} ${n(cy - arm)}l${n(arm * 2)} ${n(arm * 2)}M${n(cx + arm)} ${n(cy - arm)}l${n(-arm * 2)} ${n(arm * 2)}`;
  return [
    { d: oval(cx, cy, r), fill: INK.white },
    { d: stroke, line: 2.6, ink: INK.red },
  ];
}

/** A prize ball, with its star. */
function ball(cx: number, cy: number, r: number): Shape[] {
  const star = Array.from({ length: 10 }, (_unused, index) => {
    const reach = index % 2 === 0 ? r * 0.56 : r * 0.24;
    const angle = (index * Math.PI) / 5;
    return `${n(cx + Math.sin(angle) * reach)} ${n(cy - Math.cos(angle) * reach)}`;
  });
  return [
    { d: oval(cx, cy, r), fill: INK.magenta },
    { d: oval(cx - r * 0.3, cy - r * 0.34, r * 0.3, r * 0.2), fill: INK.pink, line: 0 },
    { d: `M${star.join('L')}Z`, fill: INK.goldLight, line: 0.6 },
  ];
}

/** Medals lying about the two tables, so that they read as tables: across the field, and out from the back wall. */
const ON_PUSHER: readonly (readonly [number, number])[] = [
  [18, 14],
  [33, 9],
  [47, 17],
  [62, 11],
  [78, 16],
  [26, 25],
  [42, 30],
  [58, 26],
  [72, 31],
  [88, 27],
  [12, 32],
];
const ON_TABLE: readonly (readonly [number, number])[] = [
  [14, 62],
  [30, 58],
  [70, 60],
  [86, 64],
  [22, 74],
  [40, 70],
  [56, 76],
  [76, 74],
  [12, 86],
  [32, 88],
  [50, 90],
  [68, 88],
  [88, 86],
];

// ── The drawings ────────────────────────────────────────────────────────────

/** Words a drawing carries, in the plate's language. */
export interface ArtWords {
  get: string;
  hold: string;
  jackpot: string;
}

interface ArtProps {
  rules: PlateRules;
  words: ArtWords;
  mouths: readonly Mouth[];
}

type View = readonly [x: number, y: number, width: number, height: number];

/** A drawing's frame: the part of the picture it shows, and how wide a key line is there. `fine` is how many key lines fit across it. */
const Sheet = ({ art, view, fine = 132, children }: { art: string; view: View; fine?: number; children: (k: number) => ReactNode }) => {
  const k = view[2] / fine;
  return (
    <svg className={styles.art} viewBox={view.map(n).join(' ')} data-plate-art={art} aria-hidden focusable="false">
      <defs>
        <Tone art={art} k={k} />
      </defs>
      <g fill="none" stroke={INK.key} strokeLinejoin="round" strokeLinecap="round">
        {children(k)}
      </g>
    </svg>
  );
};

/** A label in a drawing: letters with a key line round them. */
const Word = ({ x, y, size, fill = INK.white, children }: { x: number; y: number; size: number; fill?: string; children: ReactNode }) => (
  <text className={styles.artWord} x={n(x)} y={n(y)} fontSize={n(size)} textAnchor="middle" fill={fill} stroke={INK.key} strokeWidth={n(size * 0.22)}>
    {children}
  </text>
);

/** A round feed button of the control panel, with its letter. */
const FeedButton = ({ cx, cy, r, letter, k, pressed = false }: { cx: number; cy: number; r: number; letter: string; k: number; pressed?: boolean }) => {
  const top = cy + (pressed ? r * 0.12 : 0);
  return (
    <>
      <Print
        k={k}
        shapes={[
          { d: oval(cx, cy + r * 0.22, r, r * 0.9), fill: INK.goldDark },
          { d: oval(cx, top, r, r * 0.9), fill: INK.gold },
          { d: oval(cx, top, r * 0.76, r * 0.68), fill: INK.goldLight, line: 0 },
        ]}
      />
      <text className={styles.artLetter} x={n(cx)} y={n(top + r * 0.36)} fontSize={n(r * 1.02)} textAnchor="middle" fill={INK.key} stroke="none">
        {letter}
      </text>
    </>
  );
};

/** A hand with a finger out, its tip at (x, y), pointing up the drawing. `size` is the finger's width. */
function hand(x: number, y: number, size: number): Shape[] {
  const w = size;
  return [
    // The folded fingers, the thumb, and the back of the hand.
    { d: box(x + w * 0.42, y + w * 1.75, w * 2.2, w * 2.5, w * 0.5), fill: INK.white },
    { d: box(x - w * 1.55, y + w * 2.3, w * 1.5, w * 0.95, w * 0.45), fill: INK.white },
    { d: box(x - w * 0.62, y + w * 1.9, w * 2.6, w * 3.4, w * 0.7), fill: INK.white },
    // The finger that points.
    { d: box(x - w * 0.5, y, w, w * 3.1, w * 0.5), fill: INK.white },
    { d: box(x - w * 0.36, y + w * 2.2, w * 0.72, w * 1.2), fill: INK.white, line: 0 },
  ];
}

/** 1. A medal goes in at L or R: the two slots at the front corners, their rails, and the two buttons under them. */
const Insert = ({ mouths }: ArtProps) => {
  const view: View = [-22, 486, 684, 456];
  const left = project(armCollar(0).x, armCollar(0).height, armCollar(0).depth);
  const right = project(armCollar(1).x, armCollar(1).height, armCollar(1).depth);
  const deck = 872;
  return (
    <Sheet art="insert" view={view}>
      {(k) => (
        <>
          <Print
            k={k}
            shapes={[
              ...pusher('insert'),
              ...medals(
                ON_PUSHER.filter(([, depth]) => depth > 18),
                true,
              ),
              ...table('insert'),
              ...catcher('insert', mouths),
              ...medals(ON_TABLE),
              ...sides('insert'),
              // The control panel under the cabinet's front.
              { d: box(view[0], 826, view[2], 122), fill: INK.purple },
              { d: box(view[0], 826, view[2], 122), fill: tone('insert'), line: 0 },
              ...rail(0),
              ...rail(1),
              ...slot(0),
              ...slot(1),
            ]}
          />
          <StartWords size={15} />
          <FeedButton cx={left.x + 44} cy={deck} r={40} letter="L" k={k} pressed />
          <FeedButton cx={right.x - 44} cy={deck} r={40} letter="R" k={k} />
          <Print
            k={k}
            shapes={[
              // From each button up to its slot.
              { d: arrow(left.x + 118, deck - 30, left.x + 52, left.y + 34, 16), fill: INK.red },
              { d: arrow(right.x - 118, deck - 30, right.x - 52, right.y + 34, 16), fill: INK.red },
              // A medal on its edge at the mouth of each slot, and one on its way up each rail.
              ...coin(left.x + 2, left.y - 2, 22, 0.3),
              ...coin(right.x - 2, right.y - 2, 22, 0.3),
              ...coin(152, 562, 17),
              ...coin(488, 562, 17),
              ...hand(left.x + 70, deck - 6, 14),
            ]}
          />
        </>
      )}
    </Sheet>
  );
};

/** 2. Aiming: the tip of a rail swings across the pusher, and the medal drops off wherever it points. */
const Aim = ({ mouths }: ArtProps) => {
  const view: View = [58, 344, 524, 349];
  const far = ARM_REACH[0].min + 9;
  const tip = project(armStart(0), 33, 22);
  const tipFar = project(far, 33, 22);
  const land = project(armStart(0) - 1, P, (LANDING.from + LANDING.to) / 2);
  return (
    <Sheet art="aim" view={view}>
      {(k) => (
        <>
          <Print
            k={k}
            shapes={[
              ...wall('aim'),
              ...pusher('aim'),
              ...medals(ON_PUSHER, true),
              ...table('aim'),
              ...catcher('aim', mouths),
              ...medals(ON_TABLE.filter(([, depth]) => depth < 66)),
              ...rail(0, far, true),
              ...rail(0),
              ...rail(1),
              // The tip swings: an arrow each way over the pusher.
              { d: arrow(tip.x - 16, tip.y - 22, tipFar.x - 6, tipFar.y - 22, 13), fill: INK.red },
              { d: arrow(tip.x - 36, tip.y - 22, tip.x + 22, tip.y - 22, 13), fill: INK.red },
              // The medal drops off the tip onto the pusher.
              ...coin(tip.x - 2, tip.y + 20, 13),
              { d: arrow(tip.x - 2, tip.y + 38, land.x, land.y - 6, 9), fill: INK.gold },
              // The slider under the button, in a corner of its own.
              { d: box(384, 604, 188, 78, 10), fill: INK.white },
              { d: box(404, 649, 148, 10, 5), fill: INK.steel },
              { d: box(404, 649, 74, 10, 5), fill: INK.cyan },
              { d: oval(478, 654, 13), fill: INK.white },
              { d: arrow(472, 626, 420, 626, 9), fill: INK.red },
              { d: arrow(484, 626, 536, 626, 9), fill: INK.red },
            ]}
          />
          <StartWords size={14} />
        </>
      )}
    </Sheet>
  );
};

/** Where the push drawing's marks stand: how far in from the side the medal that goes down each mouth is, and how far from the middle of the tray each of its two arrows. */
export const PUSH_MARKS = { lost: SIDE_HOLE.reach / 2 - 0.5, won: 72 } as const;

/** 3. Medals pushed over the middle of the front edge are won; those squeezed out of the open sides, or pushed over a front corner into the side hole's mouth there, are gone. */
const Push = ({ words, mouths }: ArtProps) => {
  const view: View = [-66, 474, 772, 515];
  const front = project(W / 2, 0, FIELD.depth);
  const open = project(0, 0, (FIELD.sideOpenFrom + FIELD.depth) / 2);
  const openRight = project(W, 0, (FIELD.sideOpenFrom + FIELD.depth) / 2);
  const hole = project(PUSH_MARKS.lost, 0, FIELD.depth);
  const holeRight = project(W - PUSH_MARKS.lost, 0, FIELD.depth);
  return (
    <Sheet art="push" view={view} fine={124}>
      {(k) => (
        <>
          <Print
            k={k}
            shapes={[
              ...pusher('push'),
              ...medals(
                ON_PUSHER.filter(([, depth]) => depth > 14),
                true,
              ),
              ...table('push'),
              ...catcher('push', mouths),
              ...medals(ON_TABLE),
              ...sides('push'),
              // The pusher shoves forward.
              { d: arrow(120, 590, 120, 672, 22), fill: INK.white },
              { d: arrow(520, 590, 520, 672, 22), fill: INK.white },
              // Over the middle of the front edge, into the tray: won.
              ...medal(34, 100.5, false, 26),
              ...medal(47, 101, false, 60),
              ...medal(62, 100.5, false, 34),
              { d: arrow(front.x - PUSH_MARKS.won, front.y + 32, front.x - PUSH_MARKS.won, front.y + 140, 32), fill: INK.green },
              { d: arrow(front.x + PUSH_MARKS.won, front.y + 32, front.x + PUSH_MARKS.won, front.y + 140, 32), fill: INK.green },
              // Over the front edge at a corner, down the side hole's mouth: lost.
              ...medal(PUSH_MARKS.lost, 100.5, false, 16),
              ...medal(W - PUSH_MARKS.lost, 100.5, false, 16),
              { d: arrow(hole.x, hole.y + 44, hole.x, hole.y + 100, 18), fill: INK.red },
              { d: arrow(holeRight.x, holeRight.y + 44, holeRight.x, holeRight.y + 100, 18), fill: INK.red },
              ...lostMark(hole.x, hole.y + 128, 22),
              ...lostMark(holeRight.x, holeRight.y + 128, 22),
              // Out of the open sides: lost.
              ...medal(-4.5, 88),
              ...medal(104.5, 90),
              { d: arrow(open.x + 8, open.y - 16, open.x - 62, open.y + 2, 16), fill: INK.red },
              { d: arrow(openRight.x - 8, openRight.y - 16, openRight.x + 62, openRight.y + 2, 16), fill: INK.red },
              ...lostMark(open.x - 40, open.y - 52, 24),
              ...lostMark(openRight.x + 40, openRight.y - 52, 24),
            ]}
          />
          <StartWords size={15} />
          <Word x={front.x} y={front.y + 128} size={54} fill={INK.goldLight}>
            {words.get}
          </Word>
        </>
      )}
    </Sheet>
  );
};

/** A medal standing on its edge: how much larger than life it is drawn, and how tall it looks for its width when it is seen face on. */
const EDGE_ON = { larger: 1.3, tall: 0.94 } as const;

/** How far down the plate from the lip the middle of the medal that is sliding into a hole is drawn: coming off the lip, its middle just above the opening and its nose over it, and the rest of the opening shows below it. */
const SLIDING_AT = CATCHER.back - 0.3;
/** How far clear of the plate's top the middle of that medal is: half its thickness. */
const SLIDING_CLEAR = MEDAL_THICKNESS / 2;

/**
 * The medal that is about to go down a mouth, and the arrow that says so.
 * Into a hole in the plate it slides: it lies flat on the plate with its
 * face up, just off the lip, its nose over the opening, and the arrow goes
 * from it down into the hole. Into a round hole it tips
 * over the lip lying flat. Into a slit it stands on its edge, half in
 * already: side on in a slit that runs away from the player, and face on in
 * one that runs across.
 */
function dropping(mouth: Mouth, chucker: number): Shape[] {
  if (mouth.pocket) {
    // As wide as a medal is there, and as tall as the camera sees one that lies on the plate.
    const x = CHECKERS.positions[chucker];
    const [cx, cy] = xy(...onSlide(x, SLIDING_AT, SLIDING_CLEAR));
    const rx = Math.abs(xy(...onSlide(x + MEDAL_RADIUS, SLIDING_AT, SLIDING_CLEAR))[0] - cx);
    const ry = Math.abs(xy(...onSlide(x, SLIDING_AT + MEDAL_RADIUS, SLIDING_CLEAR))[1] - xy(...onSlide(x, SLIDING_AT - MEDAL_RADIUS, SLIDING_CLEAR))[1]) / 2;
    // Its rim shows under its face: a medal's thickness nearer the plate, as the camera sees that there.
    const rim = xy(...onSlide(x, SLIDING_AT, SLIDING_CLEAR - MEDAL_THICKNESS))[1];
    return [
      { d: oval(cx, rim, rx, ry), fill: INK.silverDark, line: 0.8, flat: true },
      { d: oval(cx, cy, rx, ry), fill: INK.silver, line: 0.8, flat: true },
      { d: oval(cx, cy, rx * 0.62, ry * 0.62), fill: INK.silverLight, line: 0 },
      // From its middle down into the hole.
      { d: arrow(cx, cy - ry * 0.35, mouth.x, mouth.y + mouth.tall * 0.32, 8), fill: INK.red },
    ];
  }
  if (mouth.round) return [...medal(CHECKERS.positions[chucker], LIP - 6.5, true), { d: arrow(mouth.x, mouth.y - 46, mouth.x, mouth.y - 4, 10), fill: INK.red }];
  const spot = mouthSpot(chucker, MID_STROKE);
  // It is drawn a little larger than life, as the thing the picture is about.
  const size = MEDAL_RADIUS * project(spot.x, spot.height, spot.depth).scale * EDGE_ON.larger;
  const rx = mouth.wide < mouth.tall ? Math.max(mouth.wide * 0.42, size * 0.2) : size;
  const ry = size * EDGE_ON.tall;
  const cy = mouth.y - ry * 0.6;
  const beside = mouth.x - rx - 17;
  return [
    { d: oval(mouth.x, cy, rx, ry), fill: INK.silver, line: 0.8, flat: true },
    { d: oval(mouth.x, cy, rx * 0.6, ry * 0.66), fill: INK.silverLight, line: 0 },
    { d: arrow(beside, cy - ry * 0.9, beside, mouth.y - 2, 10), fill: INK.red },
  ];
}

/** 4. A medal through a START mouth spins the slot, and the hold's lamps count the spins that wait. */
const Start = ({ rules, words, mouths }: ArtProps) => {
  const view: View = [112, 356, 416, 277];
  // The mouth in the middle is the one the medal is shown going down.
  const chucker = Math.floor(mouths.length / 2);
  const mouth = mouths[chucker];
  const label = project(HOLD_LAMPS.label, (HOUSING.shelf + SCREEN.foot) / 2, HOUSING.ledge);
  const inset = { x: 410, y: 398, width: 108, height: 78 };
  const reels = [0, 1, 2].map((reel) => inset.x + 9 + reel * 31);
  return (
    <Sheet art="start" view={view}>
      {(k) => (
        <>
          <Print
            k={k}
            shapes={[
              // The foot of the screen, over the shelf.
              { d: outline([0, SCREEN.foot, 0], [W, SCREEN.foot, 0], [W, SCREEN.foot + 8, 0], [0, SCREEN.foot + 8, 0]), fill: INK.purpleDark },
              ...wall('start'),
              ...holdLamps(rules.hold, 3),
              ...pusher('start'),
              ...medals(
                ON_PUSHER.filter(([x]) => x > 22 && x < 70),
                true,
              ),
              ...table('start'),
              ...catcher('start', mouths),
            ]}
          />
          {/* The medal that goes down the middle mouth, as that mouth takes one. */}
          <g data-plate-drop={dropPose(mouth)}>
            <Print k={k} shapes={dropping(mouth, chucker)} />
          </g>
          <Print
            k={k}
            shapes={[
              // And what that does: the reels turn.
              { d: box(inset.x, inset.y, inset.width, inset.height, 9), fill: INK.gold },
              ...reels.map((x) => ({ d: box(x, inset.y + 10, 28, inset.height - 20, 4), fill: INK.white, line: 0.8 })),
              ...reels.flatMap((x) => [0, 1, 2].map((row) => ({ d: `M${n(x + 6)} ${n(inset.y + 24 + row * 13)}h16`, line: 1.4, ink: row === 1 ? INK.red : INK.lilac }))),
              { d: arrow(mouth.x + 62, mouth.y - 12, inset.x + 30, inset.y + inset.height + 6, 14), fill: INK.red },
            ]}
          />
          <StartWords size={15} />
          <text className={styles.artLetter} x={n(label.x - 4)} y={n(label.y + 4.5)} fontSize="12.5" textAnchor="middle" fill={INK.key} stroke="none">
            {words.hold}
          </text>
        </>
      )}
    </Sheet>
  );
};

/** Where the three reels stand on the screen, in the picture: the left edge of the first, their top, and the size of each window. */
const REELS = { left: 166, top: 118, width: 98, height: 128, gap: 7 } as const;

/** 5. Three alike on the screen in the back wall. */
const Match = ({ rules }: ArtProps) => {
  const view: View = [20, -22, 600, 400];
  const seven = rules.tierDigits.seven[0];
  const reels = [0, 1, 2].map((reel) => REELS.left + reel * (REELS.width + REELS.gap));
  const middle = REELS.top + REELS.height / 2;
  const burst = Array.from({ length: 24 }, (_unused, index) => {
    const reach = index % 2 === 0 ? 1 : 0.84;
    const angle = (index * Math.PI) / 12;
    return `${n(320 + Math.sin(angle) * 256 * reach)} ${n(middle - Math.cos(angle) * 132 * reach)}`;
  });
  const hatch = project(HATCH.x, HATCH.height, HATCH.depth);
  const lamps = [8, 18, 28, 38, 62, 72, 82, 92].map((x) => {
    const lamp = project(x, HATCH.height, HATCH.depth);
    return { d: oval(lamp.x, lamp.y, 5.5), fill: INK.white, line: 0.7, flat: true };
  });
  // The sugoroku board lies across the front of the screen: a strip of its squares, seen from above.
  const squares = Array.from({ length: 6 }, (_unused, index) => ({
    d: `M${n(150 + index * 58)} 300h50l6 40h-62Z`,
    fill: index === 3 ? INK.gold : INK.white,
    line: 0.8,
  }));
  return (
    <Sheet art="match" view={view}>
      {(k) => (
        <>
          <Print
            k={k}
            shapes={[
              ...sides('match'),
              ...housing('match'),
              ...lamps,
              { d: oval(hatch.x, hatch.y, HATCH.radius * hatch.scale), fill: INK.magenta },
              { d: 'M118 288h404l22 62h-448Z', fill: INK.green },
              ...squares,
              { d: `M${burst.join('L')}Z`, fill: INK.magenta, line: 0.8 },
              { d: box(REELS.left - 14, REELS.top - 14, 3 * REELS.width + 2 * REELS.gap + 28, REELS.height + 28, 12), fill: INK.gold },
              ...reels.map((x) => ({ d: box(x, REELS.top, REELS.width, REELS.height, 6), fill: INK.white })),
              // The pay line across the three.
              { d: arrow(REELS.left - 50, middle, REELS.left - 18, middle, 14), fill: INK.red },
              { d: arrow(reels[2] + REELS.width + 50, middle, reels[2] + REELS.width + 18, middle, 14), fill: INK.red },
            ]}
          />
          {reels.map((x) => (
            <svg key={x} x={n(x + 4)} y={n(REELS.top + 29)} width={n(REELS.width - 8)} height={n((REELS.width - 8) / 1.3)} viewBox="0 0 130 100">
              <ReelSymbol digit={seven} />
            </svg>
          ))}
          <Print k={k} shapes={reels.map((x) => ({ d: box(x, REELS.top, REELS.width, REELS.height, 6) }))} />
        </>
      )}
    </Sheet>
  );
};

/** The roulette as a wheel seen from above: a pocket for each of the roulette's, the crosses in red. */
function wheelShapes(rules: PlateRules, cx: number, cy: number, r: number): Shape[] {
  const count = rules.roulette.length;
  const pockets = rules.roulette.map((pocket, index) => {
    const corner = (edge: number, reach: number) => {
      const turn = ((index + edge) / count) * 2 * Math.PI;
      return `${n(cx + Math.sin(turn) * r * reach)} ${n(cy - Math.cos(turn) * r * reach)}`;
    };
    return {
      d: `M${corner(-0.5, 0.36)}L${corner(-0.5, 0.9)}A${n(r * 0.9)} ${n(r * 0.9)} 0 0 1 ${corner(0.5, 0.9)}L${corner(0.5, 0.36)}Z`,
      fill: pocket === 'stop' ? INK.red : index % 2 === 0 ? INK.lilac : INK.white,
      line: 0.6,
      flat: true,
    };
  });
  return [{ d: oval(cx, cy, r), fill: INK.gold }, { d: oval(cx, cy, r * 0.9), fill: INK.purpleDark }, ...pockets, { d: oval(cx, cy, r * 0.36), fill: INK.gold }];
}
/** The cross in each pocket that ends the run. */
const WheelCrosses = ({ rules, cx, cy, r }: { rules: PlateRules; cx: number; cy: number; r: number }) => (
  <>
    {rules.roulette.map((pocket, index) => {
      if (pocket !== 'stop') return null;
      const turn = (index / rules.roulette.length) * 2 * Math.PI;
      const x = cx + Math.sin(turn) * r * 0.64;
      const y = cy - Math.cos(turn) * r * 0.64;
      const arm = r * 0.1;
      return <path key={index} d={`M${n(x - arm)} ${n(y - arm)}l${n(arm * 2)} ${n(arm * 2)}M${n(x + arm)} ${n(y - arm)}l${n(-arm * 2)} ${n(arm * 2)}`} stroke={INK.white} strokeWidth={n(r * 0.07)} />;
    })}
  </>
);

/**
 * Where a bowl's holes are, from its middle, in bowl radii: x to the right, y
 * down the drawing. They are where the screen has them. A bowl's holes are
 * evenly spaced round a ring, the first at the far side; a pair are to the
 * right and the left, so that neither hides the other; and a bowl with one
 * hole is a funnel, with its hole in the middle.
 */
export function holePlaces(count: number): { x: number; y: number }[] {
  if (count === 1) return [{ x: 0, y: 0 }];
  const first = count === 2 ? 0.25 : 0;
  return Array.from({ length: count }, (_unused, hole) => {
    const turn = (first + hole / count) * 2 * Math.PI;
    return { x: Math.sin(turn) * BOWL_SHAPE.ring, y: -Math.cos(turn) * BOWL_SHAPE.ring };
  });
}

/** The ink of each dish's floor, the top one first, as the screen paints them: purple, then magenta, then gold. */
const DISH_INK = [INK.purple, INK.magenta, INK.goldDark] as const;

/**
 * One bowl of the jackpot challenge: a dish with a hole for each of the
 * bowl's. A hole that lets the ball down is ringed in blue with an arrow in
 * it, one that pays medals in pink, and the jackpot's in gold with a star.
 * `squash` is how flat it is drawn: 1 from straight above.
 */
function dishShapes(rules: PlateRules, bowl: number, cx: number, cy: number, r: number, squash = 1): Shape[] {
  const holes = rules.bowls[bowl] ?? [];
  const size = (holes.length === 1 ? BOWL_SHAPE.last : BOWL_SHAPE.hole) * r * 1.25;
  const drawn = holePlaces(holes.length).flatMap(({ x, y }, index): Shape[] => {
    const hole = holes[index];
    const hx = cx + x * r * 1.12;
    const hy = cy + y * r * 1.12 * squash;
    const ring: Shape = { d: oval(hx, hy, size * 1.45, size * 1.45 * squash), fill: hole === 'down' ? INK.cyan : hole === 'jackpot' ? INK.goldLight : INK.pink, line: 0.7, flat: true };
    const dark: Shape = { d: oval(hx, hy, size * 0.9, size * 0.9 * squash), fill: INK.key, line: 0 };
    if (hole === 'down') {
      const reach = size * 0.56;
      return [ring, dark, { d: `M${n(hx - reach)} ${n(hy - reach * 0.6 * squash)}h${n(reach * 2)}L${n(hx)} ${n(hy + reach * 0.9 * squash)}Z`, fill: INK.cyan, line: 0 }];
    }
    if (hole === 'jackpot') {
      const star = Array.from({ length: 10 }, (_unused, point) => {
        const reach = (point % 2 === 0 ? 0.8 : 0.34) * size;
        const angle = (point * Math.PI) / 5;
        return `${n(hx + Math.sin(angle) * reach)} ${n(hy - Math.cos(angle) * reach * squash)}`;
      });
      return [ring, dark, { d: `M${star.join('L')}Z`, fill: INK.goldLight, line: 0 }];
    }
    return [ring, dark];
  });
  return [{ d: oval(cx, cy, r, r * squash), fill: INK.gold }, { d: oval(cx, cy, r * 0.86, r * 0.86 * squash), fill: DISH_INK[bowl % DISH_INK.length] }, ...drawn];
}

/** 6. The ball over the front edge, the roulette it starts, and the bowls a full run ends in, one under another. */
const Jackpot = ({ rules, words }: ArtProps) => {
  const view: View = [0, 0, 330, 220];
  const wheel = { x: 148, y: 76, r: 50 };
  const lampAt = (index: number) => wheel.x + (index - (rules.chainGoal - 1) / 2) * 18;
  // The bowls stand in a column down the right of the drawing, seen from the front and above.
  const stack = { x: 282, top: 20, foot: 206, squash: 0.44 };
  const count = Math.max(1, rules.bowls.length);
  const pitch = (stack.foot - stack.top) / count;
  const radius = Math.min(40, (pitch * 0.62) / stack.squash / 2 + 8);
  const dishAt = (bowl: number) => stack.top + pitch * (bowl + 0.5);
  return (
    <Sheet art="jackpot" view={view} fine={120}>
      {(k) => (
        <>
          <Print
            k={k}
            shapes={[
              // The front edge of the table, and the ball going over it.
              { d: 'M6 40L88 40L100 90L-6 90Z', fill: INK.cyan },
              { d: box(-6, 90, 106, 20), fill: INK.purpleDark },
              { d: oval(22, 62, 13, 7.5), fill: INK.silver, line: 0.8 },
              { d: oval(76, 56, 12, 7), fill: INK.silver, line: 0.8 },
              ...ball(48, 110, 19),
              { d: arrow(48, 44, 48, 86, 10), fill: INK.red },
              ...wheelShapes(rules, wheel.x, wheel.y, wheel.r),
              // The run's lamps: one for each number in a row that it takes.
              ...Array.from({ length: rules.chainGoal }, (_unused, index) => ({ d: oval(lampAt(index), 146, 7), fill: INK.goldLight, line: 0.7 })),
              // The bowls, and the way down from each to the next.
              ...rules.bowls.flatMap((_holes, bowl) => dishShapes(rules, bowl, stack.x, dishAt(bowl), radius, stack.squash)),
              ...rules.bowls.slice(1).map((_holes, index) => ({ d: arrow(stack.x - radius - 9, dishAt(index) + 2, stack.x - radius - 9, dishAt(index + 1) - 2, 7), fill: INK.cyan })),
              ...ball(stack.x + radius * 0.56, dishAt(0) - radius * stack.squash * 0.5, 7),
              // From one to the next.
              { d: arrow(70, 122, 100, 106, 10), fill: INK.red },
              { d: arrow(wheel.x + wheel.r + 4, wheel.y - 22, stack.x - radius - 6, dishAt(0) - 4, 10), fill: INK.red },
            ]}
          />
          <WheelCrosses rules={rules} cx={wheel.x} cy={wheel.y} r={wheel.r} />
          {Array.from({ length: rules.chainGoal }, (_unused, index) => (
            <text key={index} className={styles.artLetter} x={n(lampAt(index))} y="149.6" fontSize="10" textAnchor="middle" fill={INK.key} stroke="none">
              {index + 1}
            </text>
          ))}
          <Word x={wheel.x + 18} y={200} size={22} fill={INK.goldLight}>
            {words.jackpot}
          </Word>
        </>
      )}
    </Sheet>
  );
};

const ART: Record<StepId, (props: ArtProps) => ReactNode> = {
  insert: Insert,
  aim: Aim,
  push: Push,
  start: Start,
  match: Match,
  jackpot: Jackpot,
};

/** Whether a step has a drawing. */
export const hasArt = (step: string): step is StepId => Object.prototype.hasOwnProperty.call(ART, step);

/**
 * The drawing for a step, or nothing for a step that has none. The START
 * mouths are the catcher's unless others are handed in, which is how a test
 * sees that a catcher with round holes or with slits would be drawn with them.
 */
export const StepArt = ({ step, rules, words, mouths }: { step: string; rules: PlateRules; words: ArtWords; mouths?: readonly Mouth[] }) => {
  if (!hasArt(step)) return null;
  const Drawing = ART[step];
  return <Drawing rules={rules} words={words} mouths={mouths ?? startMouths()} />;
};

// ── The small pictures ──────────────────────────────────────────────────────

/** A small picture: its shapes, in a box of its own. */
const Glyph = ({ name, view, fine = 34, shapes, children }: { name: string; view: View; fine?: number; shapes: Shape[]; children?: ReactNode }) => (
  <svg className={styles.glyph} viewBox={view.map(n).join(' ')} data-plate-glyph={name} aria-hidden focusable="false">
    <g fill="none" stroke={INK.key} strokeLinejoin="round" strokeLinecap="round">
      <Print k={view[2] / fine} shapes={shapes} />
      {children}
    </g>
  </svg>
);

/** A stack of medals: a tower. */
const stack = (cx: number, foot: number, count: number, rx: number): Shape[] =>
  Array.from({ length: count }, (_unused, index) => ({ d: oval(cx, foot - index * rx * 0.36, rx, rx * 0.42), fill: index === count - 1 ? INK.silverLight : INK.silver, line: 0.8 }));

const DIE_PIPS: readonly (readonly [number, number])[] = [
  [13, 13],
  [27, 13],
  [20, 20],
  [13, 27],
  [27, 27],
];

/** What a line of the slot leads to, as a small picture: the prize ball, a treasure chest, or the die of the sugoroku board. */
export const BonusGlyph = ({ leads }: { leads: Bonus }) => {
  if (leads === 'ball') return <Glyph name="ball" view={[0, 0, 40, 40]} shapes={ball(20, 20, 16)} />;
  if (leads === 'chest') {
    return (
      <Glyph
        name="chest"
        view={[0, 0, 40, 40]}
        shapes={[
          { d: 'M5 20Q5 7 20 7Q35 7 35 20Z', fill: INK.magenta },
          { d: box(5, 20, 30, 14, 2), fill: INK.gold },
          { d: box(17, 7.5, 6, 26.5), fill: INK.goldLight, line: 0.7 },
          { d: oval(20, 22, 3.6), fill: INK.white, line: 0.8 },
        ]}
      />
    );
  }
  return <Glyph name="die" view={[0, 0, 40, 40]} shapes={[{ d: box(6, 6, 28, 28, 6), fill: INK.white }, ...DIE_PIPS.map(([x, y]) => ({ d: oval(x, y, 2.7), fill: INK.red, line: 0 }))]} />;
};

/** A medal tower, beside a prize that is stacked as one. */
export const TowerGlyph = () => <Glyph name="tower" view={[0, 0, 24, 30]} fine={22} shapes={stack(12, 24, 6, 8)} />;

/** The stations on the way to the jackpot. */
export const PathGlyph = ({ stage, rules, bowl = 0 }: { stage: 'ball' | 'roulette' | 'bowl'; rules: PlateRules; bowl?: number }) => {
  if (stage === 'ball') {
    return (
      <Glyph
        name="path-ball"
        view={[0, 0, 60, 60]}
        fine={44}
        shapes={[
          { d: 'M8 8L52 8L58 30L2 30Z', fill: INK.cyan },
          { d: box(2, 30, 56, 8), fill: INK.purpleDark },
          { d: oval(16, 19, 7, 4), fill: INK.silver, line: 0.8 },
          { d: oval(44, 17, 6.5, 3.8), fill: INK.silver, line: 0.8 },
          ...ball(30, 42, 12),
          { d: arrow(30, 8, 30, 27, 6), fill: INK.red },
        ]}
      />
    );
  }
  if (stage === 'roulette') {
    return (
      <Glyph name="path-roulette" view={[0, 0, 60, 60]} fine={44} shapes={wheelShapes(rules, 30, 30, 27)}>
        <WheelCrosses rules={rules} cx={30} cy={30} r={27} />
      </Glyph>
    );
  }
  return <Glyph name="path-bowl" view={[0, 0, 60, 60]} fine={44} shapes={dishShapes(rules, bowl, 30, 30, 27)} />;
};

/** What the START mouths are: the compact plate's little picture of them follows too. */
type MouthKind = 'pockets' | 'holes' | 'slits';
const kindOf = (mouths: readonly Mouth[]): MouthKind => (mouths.every((mouth) => mouth.pocket) ? 'pockets' : mouths.every((mouth) => mouth.round) ? 'holes' : 'slits');
const MOUTH_KIND = kindOf(startMouths());

/**
 * The compact plate's picture of the START mouths: three holes with square
 * corners in the plate, a START sign to either side of them, and a medal
 * sliding flat down the plate into the middle hole; three round holes with a
 * medal lying over them; or three slits with one on its edge.
 */
const miniStart = (kind: MouthKind): Shape[] => {
  const places = kind === 'pockets' ? [13, 22, 31] : [9.5, 22, 34.5];
  return [
    ...(kind === 'pockets'
      ? [
          { d: box(2, 6, 40, 18, 2), fill: INK.white },
          { d: box(2.6, 9, 5, 11, 1), fill: INK.magenta },
          { d: box(36.4, 9, 5, 11, 1), fill: INK.magenta },
        ]
      : [
          { d: box(2, 13, 40, 11, 2), fill: INK.white },
          { d: box(2, 22, 40, 6, 1.5), fill: INK.magenta },
        ]),
    ...places.flatMap((x) =>
      kind === 'pockets'
        ? [
            { d: box(x - 4.4, 14.2, 8.8, 7, 0.5), fill: INK.gold, line: 0.7 },
            { d: box(x - 3.2, 15.3, 6.4, 4.8), fill: INK.key, line: 0 },
          ]
        : kind === 'holes'
          ? [
              { d: oval(x, 18, 5.2, 3.4), fill: INK.gold, line: 0.7 },
              { d: oval(x, 18, 3.6, 2.2), fill: INK.key, line: 0 },
            ]
          : [
              { d: box(x - 2.7, 14, 5.4, 8, 2.7), fill: INK.gold, line: 0.7 },
              { d: box(x - 1.3, 15.2, 2.6, 5.6, 1.3), fill: INK.key, line: 0 },
            ],
    ),
    kind === 'pockets' ? { d: oval(22, 10.4, 4.6, 3), fill: INK.silver, line: 0.8 } : kind === 'holes' ? { d: oval(22, 6, 5.5, 3.2), fill: INK.silver, line: 0.8 } : { d: oval(22, 8.5, 1.9, 5.8), fill: INK.silver, line: 0.8 },
    kind === 'pockets' ? { d: arrow(22, 9.6, 22, 19, 3.2), fill: INK.red } : kind === 'holes' ? { d: arrow(22, 8, 22, 16.5, 3.8), fill: INK.red } : { d: arrow(15.5, 3, 15.5, 13, 3.8), fill: INK.red },
  ];
};

/** The compact plate's picture for a step: the one thing that step is about, small enough to read at a glance. */
const MINI: Record<Exclude<StepId, 'start'>, Shape[]> = {
  insert: [
    { d: oval(30, 15, 11), fill: INK.white },
    { d: oval(30, 15, 8.4), fill: INK.cyan, line: 0.7 },
    { d: oval(30, 15, 5.6), fill: INK.purpleDark, line: 0.7 },
    ...coin(8, 20.5, 7.5, 0.36),
    { d: arrow(12.5, 19.5, 23.5, 16.5, 4.4), fill: INK.red },
  ],
  aim: [
    { d: 'M3 28L25 10', line: 4.6 },
    { d: 'M3 28L25 10', line: 2.6, ink: INK.lilac },
    { d: arrow(26.5, 5.5, 14, 5.5, 4), fill: INK.red },
    { d: arrow(29.5, 5.5, 42, 5.5, 4), fill: INK.red },
    { d: oval(29, 21, 7, 4), fill: INK.silverDark, line: 0.8 },
    { d: oval(29, 19.4, 7, 4), fill: INK.silver, line: 0.8 },
  ],
  push: [
    { d: 'M8 3L36 3L42 16L2 16Z', fill: INK.cyan },
    { d: box(2, 16, 40, 5), fill: INK.purpleDark },
    { d: oval(15, 9, 5.5, 3), fill: INK.silver, line: 0.8 },
    { d: oval(30, 10, 5.5, 3), fill: INK.silver, line: 0.8 },
    { d: oval(22, 24, 6, 3.4), fill: INK.silver, line: 0.8 },
    { d: arrow(8, 19, 8, 29, 4.4), fill: INK.green },
    { d: arrow(36, 19, 36, 29, 4.4), fill: INK.green },
  ],
  match: [{ d: box(2, 4, 40, 22, 3.5), fill: INK.gold }, ...[5, 17, 29].map((x) => ({ d: box(x, 7, 10, 16, 1.6), fill: INK.white, line: 0.7 }))],
  jackpot: [
    ...ball(10, 19.5, 8),
    { d: arrow(18.5, 16.5, 25, 15, 4), fill: INK.red },
    { d: oval(33, 15, 10.5), fill: INK.gold },
    { d: oval(33, 15, 8.6), fill: INK.purple, line: 0.7 },
    { d: oval(33, 12, 3.2), fill: INK.goldLight, line: 0.6 },
    { d: oval(29.6, 18, 2.4), fill: INK.key, line: 0 },
    { d: oval(36.4, 18, 2.4), fill: INK.key, line: 0 },
  ],
};

/**
 * The compact plate's picture for a step. Its START mouths are what the
 * catcher has, unless `roundMouths` says to draw round holes, or slits, as a
 * test does to see that such a catcher would be drawn so.
 */
export const StepGlyph = ({ step, roundMouths }: { step: string; roundMouths?: boolean }) => {
  if (!hasArt(step)) return null;
  const kind = roundMouths === undefined ? MOUTH_KIND : roundMouths ? 'holes' : 'slits';
  return (
    <Glyph name={`step-${step}`} view={[0, 0, 44, 30]} fine={36} shapes={step === 'start' ? miniStart(kind) : MINI[step]}>
      {step === 'match' &&
        [10, 22, 34].map((x) => (
          <text key={x} className={styles.artLetter} x={x} y="19.6" fontSize="12.5" textAnchor="middle" fill={INK.red} stroke="none">
            7
          </text>
        ))}
    </Glyph>
  );
};

/** A hand at work on the machine, for the strip of controls: pressing a feed button, dragging across the field, or moving a slider. */
export const HandGlyph = ({ doing }: { doing: 'press' | 'drag' | 'slide' }) => {
  if (doing === 'press') {
    return (
      <Glyph
        name="hand-press"
        view={[0, 0, 60, 44]}
        fine={44}
        shapes={[{ d: oval(22, 18, 15, 13.5), fill: INK.goldDark }, { d: oval(22, 15, 15, 13.5), fill: INK.gold }, { d: oval(22, 15, 11, 9.8), fill: INK.goldLight, line: 0 }, ...hand(34, 18, 6.2)]}
      >
        <text className={styles.artLetter} x="18" y="20" fontSize="13" textAnchor="middle" fill={INK.key} stroke="none">
          L
        </text>
      </Glyph>
    );
  }
  if (doing === 'drag') {
    return (
      <Glyph
        name="hand-drag"
        view={[0, 0, 60, 44]}
        fine={44}
        shapes={[
          { d: 'M10 5L50 5L57 30L3 30Z', fill: INK.cyan },
          { d: 'M10 28L27 9', line: 3.6 },
          { d: 'M10 28L27 9', line: 2, ink: INK.lilac },
          { d: arrow(26, 13, 9, 13, 4.6), fill: INK.red },
          { d: arrow(34, 13, 51, 13, 4.6), fill: INK.red },
          ...hand(30, 16, 5.6),
        ]}
      />
    );
  }
  return (
    <Glyph
      name="hand-slide"
      view={[0, 0, 60, 44]}
      fine={44}
      shapes={[
        { d: box(5, 16, 50, 6, 3), fill: INK.steel },
        { d: box(5, 16, 25, 6, 3), fill: INK.cyan },
        { d: oval(30, 19, 6.6), fill: INK.white },
        { d: arrow(24, 7, 9, 7, 4.4), fill: INK.red },
        { d: arrow(36, 7, 51, 7, 4.4), fill: INK.red },
        ...hand(30, 22, 5.2),
      ]}
    />
  );
};
