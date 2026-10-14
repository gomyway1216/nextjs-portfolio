/**
 * Draws the cabinet on a canvas: the housing round the screen in the back
 * wall, the pusher that comes out from under it with the catcher for the
 * START pockets hung on its front, the two tables of medals, the two feed
 * arms with a slot at the near end of each, the open sides, the tray at the
 * middle of the front with a side hole's mouth at each corner beside it, and
 * over them the lights, sparks and glass of an arcade cabinet.
 * Nothing here decides anything — it only shows the machine the engine is
 * running.
 *
 * The screen itself is not drawn. It is the page's own, stood behind the
 * canvas exactly where the opening in the housing is, and the picture is
 * left clear there but for what is in front of the screen.
 */

import { ARMS, HATCH, SLOT, airSpot, armCollar, fedSpot, leftHeld, railFrame, slotSpot, type Spot } from './arms';
import { offLifts } from './works';
import { drawHatches, drawHopper, drawLifts } from './works2d';
import { APRON, CATCHER, SLOPE, START_SLOT, TONGUE, apronSpot, caught, lampSpot, litSlots, mouthSpot, rolling, slopeSpot, slotCorners, slotHalf, tongueCorners, tongueHalf, underCatcher, wellCorners, wingCorners, type Caught } from './catcher';
import { CHUCKERS } from './chuckers';
import { CHECKERS, FIELD, LANDING, MEDAL_RADIUS, PUSHER, SETTLE, frontPays, pusherFront, type Arm, type Machine, type Medal } from './engine';
import {
  JEWEL_CUT,
  JEWEL_FACETS,
  JEWEL_GIRDLE,
  JEWEL_LAMPS,
  JEWEL_PLATE,
  JEWEL_SHOW,
  LAMP_OUTLINE,
  collectedJewel,
  facetInCabinet,
  fallingJewel,
  jewelLampX,
  lampLight,
  lyingJewel,
  pointInCabinet,
  type JewelSpot,
} from './jewel';
import { SIDE_HOLE, acrossAt, fromSide, holeAt, holeFloor, railTime, railTop, railed, sinking } from './sidehole';
import { CHUTE, EYE_AT, HEIGHT, HOLD_LAMPS, HOUSING, SCREEN, VIEW, chuteHeight, project, rise, type Projected } from './view';

const TAU = Math.PI * 2;
const R = MEDAL_RADIUS;
const P = HEIGHT.pusher;
const T = HEIGHT.medal;
const W = FIELD.width;
const D = FIELD.depth;
const OPEN = FIELD.sideOpenFrom;
/** Seconds a medal takes to drop from the pusher's lip onto the lower table. */
export const LIP_FALL = 0.18;
/** Seconds a medal that has left the field is still drawn for, on its way down. */
export const EXIT_TIME = 0.6;
/** How a medal that has gone over an edge moves: carried on at the pace it was pushed, and pulled down. */
export const EXIT = { forward: 15, sideways: 11, gravity: 190, turn: 5.5 } as const;
/**
 * How often a gold spin's hold lamp flashes, wherever it is drawn: on the canvas, in the 3D scene and on the page.
 * Twice a second, which is under the three flashes a second that are safe for anyone to look at (WCAG 2.3.1),
 * and it is the same during a fever or a jackpot, when the cabinet's other lights hurry.
 */
export const GOLD_FLASH = { perSecond: 2 } as const;
/**
 * How bright a gold spin's hold lamp is, from 0 to 1, when the stage's own clock says `clock` seconds: it goes
 * bright and dim `GOLD_FLASH.perSecond` times a second, a beat behind the lamp to its left. With motion reduced
 * (`calm`) it does not flash at all: it is steadily at its brightest.
 */
export const goldFlash = (clock: number, lamp: number, calm: boolean): number =>
  calm ? 1 : 0.5 + 0.5 * Math.sin(clock * 2 * Math.PI * GOLD_FLASH.perSecond - lamp * 0.9);
/** How bright an arm's lights are while nothing is on its rail, out of the 1 they have while a medal is. Either arm can be fed at any moment, so both glow. */
export const REST_LIGHT = 0.5;
/** How much higher than the pile a medal that has just come down is drawn, before it has come to rest. */
export const RIDE = 1.4;
/** Seconds a START pocket, the tray or a side stays lit after a medal passes. */
export const GLOW_TIME = 0.5;
/** How round a circle on a wall that faces the player looks: its height on the drawing over its width. */
const UPRIGHT = rise(project(0, 0, 0)) / project(0, 0, 0).scale;
/**
 * A rail's channel, across: how far its floor reaches to either side of the
 * edge a medal stands on, how high the wall the medal leans on stands and
 * how high the lip on the other side, how far from the collar the rail comes
 * out of the slot, and how far past the tip it runs on.
 */
const CHANNEL = { half: 0.6, wall: 2, lip: 0.7, from: 3, past: 0.6 } as const;
/**
 * Which way shadows fall on the tables: the cabinet's lamps are over the
 * back of the field and a little to the left, so for each unit a thing
 * stands above a table its shadow lies this far to the right and this far
 * toward the player.
 */
const SUN = { x: 0.29, depth: 0.39 } as const;
/**
 * How far a shadow on the screen lies from what throws it, for each unit
 * the thing is out from the wall: the room's light comes in over the
 * player's left shoulder.
 */
const CAST = { x: 0.3, y: -0.55 } as const;
/** A prize ball is drawn this large. It overhangs the flat medals round it, so it touches them over less. */
export const BALL_RADIUS = 4.3;
/** How far out from the table's edge the chute beside an open side is drawn: past the edge of the picture. */
const CHUTE_OUT = 16;
/**
 * What is printed on the lower table for the player: GET before the tray, at these places across and this depth; OUT
 * before each open side and before each side hole's mouth, at these places in from the side and depths; and the
 * depth the red paint before a mouth starts from.
 */
export const TABLE_WORDS = {
  get: [33, 50, 67],
  getAt: 93.5,
  out: [
    [7.5, 84],
    [10, 94.5],
  ],
  washFrom: 89,
} as const;
/** How far the chute's surface leans, in radians: a medal that goes down it lies along it. */
export const CHUTE_LEAN = Math.atan(CHUTE.slope);
/** How long each kind of celebration lights the cabinet, in seconds. */
export const PARTY_TIME = { crash: 0.5, fever: 5, jackpot: 9 } as const;
export type Party = keyof typeof PARTY_TIME;
/** The most sparks alive at once. */
const MAX_SPARKS = 220;
export const SPARK_COLORS = ['#fff3a8', '#ffd65c', '#ff7cc0', '#7df0ff', '#b6ff8f', '#ffffff'] as const;
/** The sparks a jewel throws: its own colour, and white. */
const JEWEL_SPARKS = ['#ff7cc0', '#ffffff', '#ffd0ea'] as const;

export interface ExitingMedal {
  id: number;
  x: number;
  y: number;
  kind: 'won' | 'lost';
  /** −1 for the left side, 1 for the right. */
  side: number;
  ball: boolean;
  /** Set on a jewel, which is drawn as the stone it is on its way out. It only ever leaves by the front. */
  jewel?: boolean;
  /**
   * Set on one that went over the front edge at a side hole's mouth, within the hole's reach of a corner
   * (sidehole.ts). A medal that did is lost: it drops into the mouth and is gone down its chute. A ball or a jewel
   * that did is collected all the same: it comes down on the bars across the mouth and rolls along them into the tray.
   */
  corner?: boolean;
  age: number;
}

/** What the stage remembers of a medal between frames. */
interface Seen {
  x: number;
  y: number;
  ball: boolean;
  jewel: boolean;
  /** Whether it was a tower: a tower that disappears has toppled, not left the field. */
  tower: boolean;
}

/** A point of light in the drawing's own pixels: a glint off a won medal, or confetti. */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
}

/**
 * A count that floats up from the tray: the medals just won, or what a jewel
 * has just paid, in its own colour. Or a word the cabinet says over a START
 * slot, which has `word`: which slot it stands over, how tall its letters
 * are, in pixels of the drawing, and whether it stands still, as it does
 * where nothing may move.
 */
interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
  color?: string;
  word?: { gate: number; size: number; still: boolean };
}

/** What a medal through a START slot came to, as the session says it in its `checker` event. */
export interface Entry {
  gate: number;
  held: boolean;
  gold: boolean;
  lucky: boolean;
}

/**
 * An entry the cabinet has not finished answering: whether it has begun to,
 * which it does in the frame the medal dropped; how many seconds its spark
 * has been on its way up to the hold's lamps, less than nothing until it
 * sets out; where on the drawing the spark set out from; and whether it has
 * a lamp of the hold to light, which is settled as the cabinet answers.
 */
export interface Arrival extends Entry {
  dropped: boolean;
  run: number;
  from: { x: number; y: number };
  lamp: boolean;
}

export interface Stage {
  /** Canvas pixels per pixel of the drawing. */
  ratio: number;
  /** Whether the three layers below have been drawn. The 3D renderer does without them until the canvas one has to take over. */
  painted: boolean;
  background: HTMLCanvasElement;
  medal: HTMLCanvasElement;
  /** The medal's face in each of the tones a medal can have gone to: `medal` itself first (see `FACES`). */
  faces: HTMLCanvasElement[];
  ball: HTMLCanvasElement;
  /** Seconds the stage has been drawn for, for its running lights. */
  clock: number;
  /** Where every medal on the field was last seen, to tell where one left it. */
  seen: Map<number, Seen>;
  /** The arm each medal on its way in was seen on, kept until it has landed: one in the air does not say which rail it left. */
  fed: Map<number, Arm>;
  exits: ExitingMedal[];
  sparks: Spark[];
  popups: Popup[];
  /** Medals won since the last count floated up, and the seconds since then. */
  tally: number;
  tallyAge: number;
  /** Seconds each light has left to shine. */
  gateGlow: number[];
  /** The medals that have dropped into a START slot that the cabinet has not finished answering, the oldest first (see `enterGate`). */
  entries: Arrival[];
  /** Seconds each of the hold's lamps still shines brighter, since a spark reached it. */
  holdGlow: number[];
  /**
   * How many of the hold's lamps are shown lit, and how many of those gold: what `holdShown` last said. A spark is
   * bound for the lamp after them. And how many of the medals the cabinet has still to answer hold a spin the
   * screen has taken already, and how many a gold one: those have no lamp to light.
   */
  hold: { stock: number; gold: number; taken: number; gilt: number };
  trayGlow: number;
  sideGlow: [number, number];
  party: { kind: Party; left: number } | null;
  /** Seconds the jewel lamp that was lit last still shines brighter, and seconds a jewel bonus's show has left. */
  jewelGlow: number;
  jewelShow: number;
}

const path = (g: CanvasRenderingContext2D, points: Projected[]): void => {
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.closePath();
};

const line = (g: CanvasRenderingContext2D, from: Projected, to: Projected): void => {
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(to.x, to.y);
  g.stroke();
};

/**
 * Makes the canvas draw as if on the lower table at (x, depth): one unit along
 * the canvas's x is one field unit across, one along its y is one toward the
 * player. Over a word or an emblem the perspective is close enough to flat.
 */
function onTable(g: CanvasRenderingContext2D, k: number, x: number, depth: number): void {
  const o = project(x, 0, depth);
  const u = project(x + 1, 0, depth);
  const v = project(x, 0, depth + 1);
  g.setTransform((u.x - o.x) * k, (u.y - o.y) * k, (v.x - o.x) * k, (v.y - o.y) * k, o.x * k, o.y * k);
}

/**
 * The same for a wall that faces the player, at (x, height) and `depth` out
 * from the back wall: one unit across, one unit down. `shift` moves it
 * sideways, in the drawing's pixels.
 */
function onPanel(g: CanvasRenderingContext2D, k: number, x: number, height: number, shift = 0, depth = 0): void {
  const o = project(x, height, depth);
  const u = project(x + 1, height, depth);
  const v = project(x, height - 1, depth);
  g.setTransform((u.x - o.x) * k, (u.y - o.y) * k, (v.x - o.x) * k, (v.y - o.y) * k, (o.x + shift) * k, o.y * k);
}

export const starPath = (g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  g.closePath();
};

/** One medal seen from straight above, drawn once and stamped wherever a medal lies. */
function medalSprite(): HTMLCanvasElement {
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.translate(size / 2, size / 2);
  const r = size / 2 - 1;
  const circle = (radius: number) => {
    g.beginPath();
    g.arc(0, 0, radius, 0, TAU);
  };

  const body = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
  body.addColorStop(0, '#fffbe0');
  body.addColorStop(0.35, '#fbd55a');
  body.addColorStop(0.8, '#dba21f');
  body.addColorStop(1, '#b97c0c');
  g.fillStyle = body;
  circle(r);
  g.fill();

  // A milled edge, a raised rim and a ring of beads inside it.
  g.strokeStyle = 'rgba(120, 76, 2, 0.55)';
  g.lineWidth = r * 0.03;
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * TAU;
    g.beginPath();
    g.moveTo(Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9);
    g.lineTo(Math.cos(angle) * r * 0.99, Math.sin(angle) * r * 0.99);
    g.stroke();
  }
  g.lineWidth = r * 0.06;
  g.strokeStyle = '#a56a06';
  circle(r * 0.88);
  g.stroke();
  g.lineWidth = r * 0.035;
  g.strokeStyle = 'rgba(255, 250, 215, 0.9)';
  circle(r * 0.82);
  g.stroke();
  g.fillStyle = 'rgba(150, 96, 6, 0.6)';
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * TAU;
    g.beginPath();
    g.arc(Math.cos(angle) * r * 0.7, Math.sin(angle) * r * 0.7, r * 0.028, 0, TAU);
    g.fill();
  }
  g.lineWidth = r * 0.03;
  g.strokeStyle = 'rgba(132, 84, 4, 0.55)';
  circle(r * 0.6);
  g.stroke();

  // An embossed star: a dark copy below-right, a light copy above-left, the face on top.
  for (const [dx, dy, fill] of [
    [r * 0.035, r * 0.04, 'rgba(120, 74, 0, 0.7)'],
    [-r * 0.03, -r * 0.035, '#fff8cf'],
    [0, 0, '#f6c544'],
  ] as const) {
    starPath(g, dx, dy, r * 0.46, r * 0.19);
    g.fillStyle = fill;
    g.fill();
  }
  // A glint across the upper left.
  const glint = g.createLinearGradient(-r, -r, r * 0.2, r * 0.2);
  glint.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  glint.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  g.fillStyle = glint;
  circle(r * 0.98);
  g.fill();
  return canvas;
}

/**
 * What is laid over a medal's face to make each of the tones a medal can
 * have gone to in the machine: as it was struck, still pale and bright,
 * dulled by handling, and gone brown. Every one of them is first washed with
 * the colour of brass, which is far less yellow than the gilt the face is
 * painted in.
 */
export const FACES = ['rgba(150, 104, 52, 0.2)', 'rgba(255, 240, 206, 0.22)', 'rgba(74, 44, 10, 0.34)', 'rgba(92, 50, 20, 0.5)'] as const;

/** Which of `FACES` a medal has, fixed by its id: of sixteen medals, seven as struck, three pale, four dulled and two brown. */
export function faceOf(id: number): number {
  const lot = (Math.imul(id, 0x9e3779b1) >>> 0) % 16;
  return lot < 7 ? 0 : lot < 10 ? 1 : lot < 14 ? 2 : 3;
}

/** The medal's face in every tone: copies of the one sprite, each with its wash laid on where the medal is. */
function medalFaces(struck: HTMLCanvasElement): HTMLCanvasElement[] {
  return FACES.map((wash, tone) => {
    const canvas = document.createElement('canvas');
    canvas.width = struck.width;
    canvas.height = struck.height;
    const g = canvas.getContext('2d');
    if (!g) return struck;
    g.drawImage(struck, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = FACES[0];
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (tone > 0) {
      g.fillStyle = wash;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
    g.globalCompositeOperation = 'source-over';
    return canvas;
  });
}

/** A prize ball: a glossy sphere with a star on it. */
function ballSprite(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.translate(size / 2, size / 2);
  const r = size / 2 - 2;
  const body = g.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.06, 0, 0, r);
  body.addColorStop(0, '#ffd9e8');
  body.addColorStop(0.3, '#ff5aa2');
  body.addColorStop(0.78, '#c4125f');
  body.addColorStop(1, '#5e0630');
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  starPath(g, 0, r * 0.08, r * 0.46, r * 0.19);
  g.fillStyle = '#fff3b0';
  g.strokeStyle = 'rgba(94, 6, 48, 0.55)';
  g.lineWidth = r * 0.05;
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, 0.8)';
  g.beginPath();
  g.ellipse(-r * 0.36, -r * 0.48, r * 0.2, r * 0.11, -0.6, 0, TAU);
  g.fill();
  return canvas;
}

/** A piece of wall that faces the player: from x0 to x1 across and from `top` down to `foot`, `depth` out from the back wall. */
const facing = (x0: number, x1: number, top: number, foot: number, depth = 0): Projected[] => [project(x0, top, depth), project(x1, top, depth), project(x1, foot, depth), project(x0, foot, depth)];

/** The opening in the housing, where the screen is seen. */
const glass = (): Projected[] => facing(SCREEN.left + HOUSING.lap, SCREEN.right - HOUSING.lap, SCREEN.top - HOUSING.lap, SCREEN.foot + HOUSING.lap);

/**
 * The housing the screen sits in, which is the back wall above the pusher,
 * and the opening in it. In the opening nothing of the picture is left, so
 * that the page's screen, behind the canvas, shows through; all that is put
 * back there is what lies on the glass and never moves. Round it: the panel
 * under the shelf, the shelf with the bed for the hold's lamps, a strip of
 * gold down each side with a bed for a row of bulbs, and over it the hood,
 * with the hatch in its face and the lit lip of the gap under it.
 */
function paintHousing(g: CanvasRenderingContext2D, ratio: number): void {
  const { shelf, ledge, hood, out, lap } = HOUSING;
  const { left, right, foot, top } = SCREEN;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  const pane = glass();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000000';
  path(g, pane);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  // On the glass: the shade the hood throws down the top of it, and two bands of light across it.
  g.save();
  path(g, pane);
  g.clip();
  const reach = project(0, top - lap - 6, 0).y;
  const shade = g.createLinearGradient(0, pane[0].y, 0, reach);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.36)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = shade;
  g.fillRect(0, pane[0].y, VIEW.width, reach - pane[0].y);
  const wide = right - left - lap * 2;
  for (const [from, to, strength] of [
    [0.56, 0.72, 0.075],
    [0.79, 0.85, 0.045],
  ] as const) {
    g.fillStyle = `rgba(255, 255, 255, ${strength})`;
    path(g, [
      project(left + lap + wide * from, top, 0),
      project(left + lap + wide * to, top, 0),
      project(left + lap + wide * (to - 0.22), foot, 0),
      project(left + lap + wide * (from - 0.22), foot, 0),
    ]);
    g.fill();
  }
  g.restore();

  // The panel under the shelf, down to the top of the pusher, which comes out from under it.
  const panel = facing(0, W, shelf, P);
  const panelShade = g.createLinearGradient(0, panel[0].y, 0, panel[2].y);
  panelShade.addColorStop(0, '#3a1a86');
  panelShade.addColorStop(0.55, '#24105e');
  panelShade.addColorStop(1, '#120735');
  g.fillStyle = panelShade;
  path(g, panel);
  g.fill();
  g.save();
  path(g, panel);
  g.clip();
  const sun = project(W / 2, shelf + 6, 0);
  for (let i = 0; i < 18; i++) {
    const from = Math.PI * (i / 18);
    g.fillStyle = i % 2 === 0 ? 'rgba(255, 120, 200, 0.08)' : 'rgba(120, 220, 255, 0.06)';
    g.beginPath();
    g.moveTo(sun.x, sun.y);
    g.arc(sun.x, sun.y, 420, from, from + Math.PI / 18);
    g.closePath();
    g.fill();
  }
  g.restore();

  // The shelf: its front, gold, with a dark bed let into it for the hold's lamps and the word that names them.
  const front = facing(0, W, foot, shelf, ledge);
  const gold = g.createLinearGradient(0, front[0].y, 0, front[2].y);
  gold.addColorStop(0, '#fff0b4');
  gold.addColorStop(0.2, '#f0bd3c');
  gold.addColorStop(0.75, '#b77d12');
  gold.addColorStop(1, '#6e4706');
  g.fillStyle = gold;
  path(g, front);
  g.fill();
  const middle = (shelf + foot) / 2;
  const last = HOLD_LAMPS.first + HOLD_LAMPS.step * 7;
  g.fillStyle = '#12082e';
  path(g, facing(HOLD_LAMPS.label - 6.2, last + HOLD_LAMPS.radius + 1.3, foot - 0.45, shelf + 0.45, ledge));
  g.fill();
  g.strokeStyle = 'rgba(255, 236, 170, 0.9)';
  g.lineWidth = 1;
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const socket = project(HOLD_LAMPS.first + HOLD_LAMPS.step * i, middle, ledge);
    const r = (HOLD_LAMPS.radius + 0.28) * socket.scale;
    g.fillStyle = '#05020f';
    g.beginPath();
    g.ellipse(socket.x, socket.y, r, r * UPRIGHT, 0, 0, TAU);
    g.fill();
  }
  onPanel(g, ratio, HOLD_LAMPS.label, middle, 0, ledge);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 2.1px "Arial Black", Arial, sans-serif';
  g.fillStyle = '#ffe98a';
  g.fillText('HOLD', 0, 0.1);
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  // Its top, sloping back to lap over the foot of the screen.
  g.fillStyle = '#ffe9a6';
  path(g, [project(0, foot + lap, 0), project(W, foot + lap, 0), project(W, foot, ledge), project(0, foot, ledge)]);
  g.fill();

  // A strip of gold down each side of the screen, cut in facets, sloping back to the glass on its inner side.
  for (const side of [-1, 1]) {
    const outer = side < 0 ? 0 : W;
    const inner = side < 0 ? left : right;
    const shoulder = inner + side * 1.1;
    const lapped = inner - side * lap;
    const face = facing(outer, shoulder, hood, foot, ledge);
    const across = g.createLinearGradient(face[0].x, 0, face[1].x, 0);
    across.addColorStop(0, '#b77d12');
    across.addColorStop(0.5, '#ffe9a6');
    across.addColorStop(1, '#d9a520');
    g.fillStyle = across;
    path(g, face);
    g.fill();
    g.fillStyle = '#7a4f0a';
    path(g, [project(shoulder, hood, ledge), project(lapped, hood, 0), project(lapped, foot + lap, 0), project(shoulder, foot, ledge)]);
    g.fill();
    g.strokeStyle = 'rgba(90, 54, 6, 0.6)';
    g.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const y = hood - ((hood - foot) * i) / 6;
      line(g, project(outer, y, ledge), project(shoulder, y, ledge));
    }
    const bed = (outer + shoulder) / 2;
    g.fillStyle = '#140a36';
    path(g, facing(bed - 0.8, bed + 0.8, hood - 1.6, foot + 1.6, ledge));
    g.fill();
  }

  // The wall over the screen, in the dark under the hood; then the hood's top and its face, in panels.
  g.fillStyle = '#0a0624';
  path(g, facing(0, W, hood, top - lap));
  g.fill();
  g.fillStyle = '#ffe9a6';
  path(g, [project(0, HEIGHT.top, 0), project(W, HEIGHT.top, 0), project(W, HEIGHT.top, out), project(0, HEIGHT.top, out)]);
  g.fill();
  const hoodFace = facing(0, W, HEIGHT.top, hood, out);
  const hoodGold = g.createLinearGradient(0, hoodFace[0].y, 0, hoodFace[2].y);
  hoodGold.addColorStop(0, '#ffe9a6');
  hoodGold.addColorStop(0.35, '#e8b22e');
  hoodGold.addColorStop(1, '#7a4f0a');
  g.fillStyle = hoodGold;
  path(g, hoodFace);
  g.fill();
  g.fillStyle = 'rgba(60, 30, 0, 0.22)';
  for (let i = 1; i < 8; i += 2) {
    path(g, facing((W * i) / 8, (W * (i + 1)) / 8, HEIGHT.top, hood, out));
    g.fill();
  }
  // The lip of the gap under the hood, which is the slot the machine pays from: a line of light all the way across.
  g.lineCap = 'butt';
  g.strokeStyle = 'rgba(255, 214, 92, 0.4)';
  g.lineWidth = 8;
  line(g, project(0, hood + 0.35, out), project(W, hood + 0.35, out));
  g.strokeStyle = '#fff3a8';
  g.lineWidth = 2.5;
  line(g, project(0, hood + 0.35, out), project(W, hood + 0.35, out));
  // The frame of the hatch. Its door opens, so every frame draws it.
  const hatch = project(HATCH.x, HATCH.height, out);
  const radius = HATCH.radius * hatch.scale;
  const chrome = g.createRadialGradient(hatch.x - radius * 0.35, hatch.y - radius * 0.35, radius * 0.1, hatch.x, hatch.y, radius);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(0.45, '#aab4d0');
  chrome.addColorStop(1, '#343c5e');
  g.fillStyle = chrome;
  g.beginPath();
  g.ellipse(hatch.x, hatch.y, radius, radius * UPRIGHT, 0, 0, TAU);
  g.fill();
}

/** The chute beside an open side of the table, as far out as it is drawn: from where the wall ends to past the front, where it meets the mouth under the front edge. */
const chutePatch = (side: number): Projected[] => {
  const x = side < 0 ? 0 : W;
  const out = x + side * CHUTE_OUT;
  const past = D + SIDE_HOLE.past;
  return [project(x, chuteHeight(0), OPEN), project(x, chuteHeight(0), past), project(out, chuteHeight(CHUTE_OUT), past), project(out, chuteHeight(CHUTE_OUT), OPEN)];
};

/** Where the tray is, across the front edge: between the cheeks, which part it from the side holes' mouths. */
export const TRAY = { from: SIDE_HOLE.reach + SIDE_HOLE.cheek, to: W - SIDE_HOLE.reach - SIDE_HOLE.cheek } as const;

/** A side hole's mouth, across: from its side of the table to the face of its cheek. */
const mouthEnds = (side: number): [number, number] => [side < 0 ? 0 : W, acrossAt(SIDE_HOLE.reach - SIDE_HOLE.cheek, side)];

/** The chute in a side hole's mouth, as far out as it is drawn: from under the front edge to past the foot of the picture. */
const mouthPatch = (side: number): Projected[] => {
  const [from, to] = mouthEnds(side);
  const past = SIDE_HOLE.past;
  return [project(from, holeFloor(0), D), project(to, holeFloor(0), D), project(to, holeFloor(past), D + past), project(from, holeFloor(past), D + past)];
};

/** Strokes one of the arrows on the chute in a mouth: two barbs that meet at its point, which is the further from the table. */
function mouthArrow(g: CanvasRenderingContext2D, side: number, mark: number): void {
  const x = acrossAt(mark, side);
  const barb = (end: number) => project(end, holeFloor(SIDE_HOLE.near), D + SIDE_HOLE.near);
  const point = project(x, holeFloor(SIDE_HOLE.far), D + SIDE_HOLE.far);
  const from = barb(x - SIDE_HOLE.span / 2);
  const to = barb(x + SIDE_HOLE.span / 2);
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(point.x, point.y);
  g.lineTo(to.x, to.y);
  g.stroke();
}

/** The inks of the ball rail's bars: the shade under each, its plated body, and the bright line along its top. */
export const RAIL_INK = { shade: '#2c3350', body: '#aab4d0', bright: '#f4f7fd' } as const;

/**
 * Lays the ball rail across a side hole's mouth, from the cabinet's frame
 * beside the table to the tray's cheek. Every frame draws it, after whatever
 * has gone down the mouth: a medal that drops in passes under the bars, and
 * is seen through them.
 */
function layRails(g: CanvasRenderingContext2D, side: number): void {
  const edge = side < 0 ? 0 : W;
  g.lineCap = 'butt';
  for (const out of SIDE_HOLE.rails) {
    const from = project(edge + side * CHUTE_OUT, railTop(0) - SIDE_HOLE.bar / 2, D + out);
    const to = project(acrossAt(SIDE_HOLE.reach - SIDE_HOLE.cheek, side), railTop(SIDE_HOLE.reach) - SIDE_HOLE.bar / 2, D + out);
    const thick = SIDE_HOLE.bar * to.scale;
    g.strokeStyle = RAIL_INK.shade;
    g.lineWidth = thick + 1.6;
    line(g, from, to);
    g.strokeStyle = RAIL_INK.body;
    g.lineWidth = thick;
    line(g, from, to);
    g.strokeStyle = RAIL_INK.bright;
    g.lineWidth = Math.max(1, thick * 0.4);
    line(g, { ...from, y: from.y - thick * 0.22 }, { ...to, y: to.y - thick * 0.22 });
  }
}

/** Strokes one of the arrows on a chute: two barbs that meet at its point, which is the further out. */
function chuteArrow(g: CanvasRenderingContext2D, side: number, mark: number): void {
  const x = side < 0 ? 0 : W;
  const barb = (end: number) => project(x + side * CHUTE.near, chuteHeight(CHUTE.near), end);
  const point = project(x + side * CHUTE.far, chuteHeight(CHUTE.far), mark);
  const from = barb(mark - CHUTE.span / 2);
  const to = barb(mark + CHUTE.span / 2);
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(point.x, point.y);
  g.lineTo(to.x, to.y);
  g.stroke();
}

/** Everything that never moves, drawn once at the canvas's own resolution. */
function backgroundLayer(ratio: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(VIEW.width * ratio);
  canvas.height = Math.round(VIEW.height * ratio);
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const flat = () => g.setTransform(ratio, 0, 0, ratio, 0, 0);
  flat();

  const backdrop = g.createLinearGradient(0, 0, 0, VIEW.height);
  backdrop.addColorStop(0, '#0d0722');
  backdrop.addColorStop(1, '#05030d');
  g.fillStyle = backdrop;
  g.fillRect(0, 0, VIEW.width, VIEW.height);

  // The cabinet's inner sides, up to where they stop and leave the table open: dark mirror, panel by panel.
  for (const x of [0, W]) {
    const side = [project(x, 0, 0), project(x, 0, OPEN), project(x, HEIGHT.top, OPEN), project(x, HEIGHT.top, 0)];
    const shade = g.createLinearGradient(side[0].x, 0, side[1].x, 0);
    shade.addColorStop(0, '#2a1a66');
    shade.addColorStop(1, '#120a30');
    g.fillStyle = shade;
    path(g, side);
    g.fill();
    // Each panel in a gold frame, with a strip of light up either side of it.
    g.lineWidth = 1.5;
    for (let depth = 0; depth < OPEN; depth += 13) {
      const to = Math.min(OPEN, depth + 13);
      g.strokeStyle = 'rgba(255, 206, 96, 0.5)';
      path(g, [project(x, HEIGHT.sideWall + 2.2, depth + 0.9), project(x, HEIGHT.sideWall + 2.2, to - 0.9), project(x, HEIGHT.top - 2.2, to - 0.9), project(x, HEIGHT.top - 2.2, depth + 0.9)]);
      g.stroke();
      g.strokeStyle = 'rgba(255, 150, 215, 0.5)';
      line(g, project(x, HEIGHT.sideWall + 3.4, depth + 1.9), project(x, HEIGHT.top - 3.4, depth + 1.9));
      g.strokeStyle = 'rgba(125, 240, 255, 0.45)';
      line(g, project(x, HEIGHT.sideWall + 3.4, to - 1.9), project(x, HEIGHT.top - 3.4, to - 1.9));
    }
    // A low rail along the table, and a lit pillar where the side ends.
    const rail = [project(x, 0, 0), project(x, 0, OPEN), project(x, HEIGHT.sideWall, OPEN), project(x, HEIGHT.sideWall, 0)];
    const railShade = g.createLinearGradient(0, rail[2].y, 0, rail[1].y);
    railShade.addColorStop(0, '#b9c2dc');
    railShade.addColorStop(1, '#4b5574');
    g.fillStyle = railShade;
    path(g, rail);
    g.fill();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 86, 170, 0.35)';
    g.lineWidth = 11;
    line(g, project(x, 1, OPEN), project(x, HEIGHT.top - 2, OPEN));
    g.strokeStyle = '#ff9bd0';
    g.lineWidth = 3.5;
    line(g, project(x, 1, OPEN), project(x, HEIGHT.top - 2, OPEN));
  }

  paintHousing(g, ratio);
  flat();
  // The bracket each slot hangs from: a bar in from the cabinet's frame, at the front corner. The slots themselves light up, so every frame draws them.
  g.lineCap = 'butt';
  for (const arm of [0, 1] as const) {
    const collar = armCollar(arm);
    const side = arm === 0 ? -1 : 1;
    const from = project(collar.x, collar.height, collar.depth - 2.1);
    const to = project((arm === 0 ? 0 : W) + side * 16, collar.height, collar.depth - 2.1);
    const bar = g.createLinearGradient(0, from.y - 1.3 * from.scale, 0, from.y + 1.3 * from.scale);
    bar.addColorStop(0, '#c2cbe2');
    bar.addColorStop(1, '#39416a');
    g.strokeStyle = bar;
    g.lineWidth = 2.6 * from.scale * UPRIGHT;
    line(g, from, to);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // The lower table: a sheet of brushed steel with lanes scribed in it, an emblem etched and the words the player needs printed on.
  const floor = [project(0, 0, 0), project(W, 0, 0), project(W, 0, D), project(0, 0, D)];
  const floorShade = g.createLinearGradient(0, floor[0].y, 0, floor[2].y);
  floorShade.addColorStop(0, '#272d3a');
  floorShade.addColorStop(0.5, '#4a5462');
  floorShade.addColorStop(1, '#6e7886');
  g.fillStyle = floorShade;
  path(g, floor);
  g.fill();
  // The brushing: strokes across the sheet, finer the further back they lie.
  for (let stroke = 0; stroke < 140; stroke++) {
    const depth = PUSHER.min + ((stroke * 61) % 97) * ((D - PUSHER.min) / 97);
    const x = (stroke * 37) % W;
    const long = 6 + ((stroke * 13) % 22);
    g.strokeStyle = stroke % 2 === 0 ? 'rgba(236, 244, 255, 0.07)' : 'rgba(6, 10, 20, 0.1)';
    g.lineWidth = 0.6;
    line(g, project(Math.max(0, x - long / 2), 0, depth), project(Math.min(W, x + long / 2), 0, depth));
  }
  g.strokeStyle = 'rgba(8, 12, 22, 0.22)';
  g.lineWidth = 1.5;
  for (let x = 10; x < W; x += 10) line(g, project(x, 0, PUSHER.min), project(x, 0, D));
  onTable(g, ratio, W / 2, 70);
  g.strokeStyle = 'rgba(10, 16, 30, 0.24)';
  g.lineWidth = 0.9;
  for (const radius of [20, 15.5]) {
    g.beginPath();
    g.arc(0, 0, radius, 0, TAU);
    g.stroke();
  }
  starPath(g, 0, 0, 13, 5.4);
  g.fillStyle = 'rgba(10, 16, 30, 0.18)';
  g.fill();
  g.font = '900 6.5px "Arial Black", Arial, sans-serif';
  g.fillStyle = 'rgba(244, 208, 96, 0.55)';
  for (const x of TABLE_WORDS.get) {
    onTable(g, ratio, x, TABLE_WORDS.getAt);
    g.fillText('GET', 0, 0);
  }
  g.fillStyle = 'rgba(232, 96, 110, 0.62)';
  g.font = '900 4.6px "Arial Black", Arial, sans-serif';
  for (const [x, depth] of TABLE_WORDS.out) {
    for (const across of [x, W - x]) {
      onTable(g, ratio, across, depth);
      g.fillText('OUT', 0, 0);
    }
  }
  flat();
  // The stretch of the table before each side hole's mouth is painted red toward the edge, and a red line is scribed
  // where the tray's stretch begins: what is pushed over the edge outside the lines is not the player's.
  for (const side of [-1, 1]) {
    const [from, to] = [side < 0 ? 0 : W, acrossAt(SIDE_HOLE.reach, side)];
    const wash = g.createLinearGradient(0, project(0, 0, TABLE_WORDS.washFrom).y, 0, project(0, 0, D).y);
    wash.addColorStop(0, 'rgba(232, 60, 84, 0)');
    wash.addColorStop(1, 'rgba(232, 60, 84, 0.34)');
    g.fillStyle = wash;
    path(g, [project(from, 0, TABLE_WORDS.washFrom), project(to, 0, TABLE_WORDS.washFrom), project(to, 0, D), project(from, 0, D)]);
    g.fill();
    g.strokeStyle = 'rgba(255, 107, 129, 0.7)';
    g.lineWidth = 1.6;
    line(g, project(to, 0, TABLE_WORDS.washFrom), project(to, 0, D));
  }
  const sheen = g.createLinearGradient(0, project(0, 0, 55).y, 0, floor[2].y);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(1, 'rgba(214, 228, 246, 0.16)');
  g.fillStyle = sheen;
  path(g, [project(0, 0, 55), project(W, 0, 55), project(W, 0, D), project(0, 0, D)]);
  g.fill();

  // The open sides: beside the table a chute a medal pushed off it goes down, lit red at the top and black
  // further down, with the wall the chute comes out from under behind it; a red edge to warn of it; and on
  // the chute arrows that point the way out.
  for (const side of [-1, 1]) {
    const x = side < 0 ? 0 : W;
    const out = x + side * CHUTE_OUT;
    g.fillStyle = '#0b0518';
    path(g, [project(x, 0, OPEN), project(out, 0, OPEN), project(out, chuteHeight(CHUTE_OUT), OPEN), project(x, chuteHeight(0), OPEN)]);
    g.fill();
    const pit = chutePatch(side);
    const dark = g.createLinearGradient(pit[0].x, 0, pit[3].x, 0);
    dark.addColorStop(0, '#6a1226');
    dark.addColorStop(0.45, '#1c060d');
    dark.addColorStop(1, '#050104');
    g.fillStyle = dark;
    path(g, pit);
    g.fill();
    g.strokeStyle = 'rgba(255, 84, 104, 0.3)';
    g.lineWidth = 7;
    line(g, project(x, 0, OPEN), project(x, 0, D));
    g.strokeStyle = '#ff6b81';
    g.lineWidth = 2.5;
    line(g, project(x, 0, OPEN), project(x, 0, D));
    g.lineJoin = 'round';
    g.lineWidth = 3;
    for (const mark of CHUTE.marks) chuteArrow(g, side, mark);
  }

  // The side holes' mouths under the front edge at the corners, where each side's chute turns the corner: black
  // under the edge, which is the inside of the hole; in it the chute, lit red at the top and black further down,
  // falling away from the table, with arrows that point the way out; and the red edge that warns of it, as far as
  // the tray's cheek. The bars across the mouth are laid every frame, over whatever has gone down it.
  for (const side of [-1, 1]) {
    const [from, to] = mouthEnds(side);
    g.fillStyle = '#030104';
    path(g, [project(from, 0, D), project(to, 0, D), project(to, holeFloor(0), D), project(from, holeFloor(0), D)]);
    g.fill();
    // The step down from the side's chute to this one, beside the table's corner.
    g.fillStyle = '#0b0518';
    path(g, [project(from, chuteHeight(0), D), project(from, chuteHeight(0), D + SIDE_HOLE.past), project(from, holeFloor(SIDE_HOLE.past), D + SIDE_HOLE.past), project(from, holeFloor(0), D)]);
    g.fill();
    const pit = mouthPatch(side);
    const dark = g.createLinearGradient(0, pit[0].y, 0, VIEW.height);
    dark.addColorStop(0, '#7a1429');
    dark.addColorStop(0.55, '#27080f');
    dark.addColorStop(1, '#070205');
    g.fillStyle = dark;
    path(g, pit);
    g.fill();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 84, 104, 0.3)';
    g.lineWidth = 7;
    line(g, project(from, 0, D), project(to, 0, D));
    g.strokeStyle = '#ff6b81';
    g.lineWidth = 2.5;
    line(g, project(from, 0, D), project(to, 0, D));
    g.lineJoin = 'round';
    g.lineWidth = 2.4;
    for (const mark of SIDE_HOLE.marks) mouthArrow(g, side, mark);
  }

  // The front of the table between the cheeks, and the tray the winnings fall into.
  const lip = [project(TRAY.from, 0, D), project(TRAY.to, 0, D), project(TRAY.to, -18, D), project(TRAY.from, -18, D)];
  const lipShade = g.createLinearGradient(0, lip[0].y, 0, lip[2].y);
  lipShade.addColorStop(0, '#0a2540');
  lipShade.addColorStop(1, '#030912');
  g.fillStyle = lipShade;
  path(g, lip);
  g.fill();
  g.strokeStyle = 'rgba(255, 214, 92, 0.35)';
  g.lineWidth = 7;
  line(g, lip[0], lip[1]);
  g.strokeStyle = '#ffd65c';
  g.lineWidth = 2.5;
  line(g, lip[0], lip[1]);
  // Arrows pointing down into the tray, to either side of the plate the jewel lamps are in.
  g.strokeStyle = 'rgba(255, 214, 92, 0.8)';
  g.lineJoin = 'round';
  for (let x = 14; x < W; x += 12) {
    if (x - 3.2 < TRAY.from || x + 3.2 > TRAY.to || (x + 3.2 > JEWEL_PLATE.from && x - 3.2 < JEWEL_PLATE.to)) continue;
    const arrow = [project(x - 3.2, -7.5, D), project(x, -13, D), project(x + 3.2, -7.5, D)];
    g.beginPath();
    g.moveTo(arrow[0].x, arrow[0].y);
    g.lineTo(arrow[1].x, arrow[1].y);
    g.lineTo(arrow[2].x, arrow[2].y);
    g.stroke();
  }
  // The plate for the jewel lamps: dark, in a gold frame, with a socket the shape of a cut stone for each lamp.
  // Neither is black: in this picture black is the inside of a hole a medal goes down, and nothing else.
  g.fillStyle = '#1d0d36';
  path(g, facing(JEWEL_PLATE.from, JEWEL_PLATE.to, JEWEL_PLATE.top, JEWEL_PLATE.foot, D));
  g.fill();
  g.strokeStyle = '#ffd65c';
  g.lineWidth = 1.6;
  g.stroke();
  for (let lamp = 0; lamp < JEWEL_LAMPS.count; lamp++) {
    g.fillStyle = '#150a26';
    path(g, lampOutline(lamp));
    g.fill();
    g.strokeStyle = 'rgba(255, 124, 192, 0.45)';
    g.lineWidth = 1;
    g.stroke();
  }
  // The cheeks that part the tray from the mouths: a bar of brushed steel each, level with the table, running out
  // from the front edge, and the face of it that looks into the tray.
  for (const side of [-1, 1]) {
    const hole = acrossAt(SIDE_HOLE.reach - SIDE_HOLE.cheek, side);
    const tray = acrossAt(SIDE_HOLE.reach + SIDE_HOLE.cheek, side);
    const past = D + SIDE_HOLE.past;
    g.fillStyle = '#39416a';
    path(g, [project(tray, 0, D), project(tray, 0, past), project(tray, -18, past), project(tray, -18, D)]);
    g.fill();
    const top = [project(hole, 0, D), project(tray, 0, D), project(tray, 0, past), project(hole, 0, past)];
    const steel = g.createLinearGradient(0, top[0].y, 0, VIEW.height);
    steel.addColorStop(0, '#e4e8f4');
    steel.addColorStop(1, '#8d97b8');
    g.fillStyle = steel;
    path(g, top);
    g.fill();
  }
  return canvas;
}

/**
 * A stage for a canvas `ratio` times the size of the drawing. With `painted`
 * false its background and sprites are left blank: the 3D renderer draws none
 * of them, and `paintStage` makes them if the canvas renderer ever takes over.
 */
export function createStage(ratio: number, painted = true): Stage {
  const blank = painted ? null : document.createElement('canvas');
  return {
    ratio,
    painted,
    background: blank ?? backgroundLayer(ratio),
    ...(blank ? { medal: blank, faces: FACES.map(() => blank) } : facesOf(medalSprite())),
    ball: blank ?? ballSprite(),
    clock: 0,
    seen: new Map(),
    fed: new Map(),
    exits: [],
    sparks: [],
    popups: [],
    tally: 0,
    tallyAge: 0,
    gateGlow: CHECKERS.positions.map(() => 0),
    entries: [],
    holdGlow: Array.from({ length: HOLD_COUNT }, () => 0),
    hold: { stock: 0, gold: 0, taken: 0, gilt: 0 },
    trayGlow: 0,
    sideGlow: [0, 0],
    party: null,
    jewelGlow: 0,
    jewelShow: 0,
  };
}

/** Draws the layers a stage was made without. */
export function paintStage(stage: Stage): void {
  if (stage.painted) return;
  stage.background = backgroundLayer(stage.ratio);
  Object.assign(stage, facesOf(medalSprite()));
  stage.ball = ballSprite();
  stage.painted = true;
}

/** Lights the START pocket a medal has just dropped through. */
export function lightGate(stage: Stage, gate: number): void {
  if (gate >= 0 && gate < stage.gateGlow.length) stage.gateGlow[gate] = GLOW_TIME;
}

/** How many lamps the hold has: one for each spin the machine can hold. */
export const HOLD_COUNT = 8;

/**
 * What the cabinet says when a medal drops into a START slot, which is when
 * it is seen to: the slot bursts with light, `reach` times further out over
 * the slide than its glow goes on to be, and throws `sparks` sparks, or
 * `gold` of them for a medal that holds a gold spin or turns one gold; a
 * word stands over the slot for `word` seconds, its letters `plain` pixels
 * of the drawing tall, `big` for a gold one and `dull` for a medal that
 * found the hold full; and a spark runs from the slot up to the hold's
 * lamps in `run` seconds and lights the lamp the spin is held as.
 */
export const BURST = { reach: 1.1, sparks: 9, gold: 16, word: 0.9, plain: 26, big: 36, dull: 20, run: 0.3 } as const;
/** The words: a medal that holds a spin, one that found the hold full and turned a held spin gold, and one that found it full and nothing left to turn. */
export const ENTRY_WORDS = { start: 'START!', gold: 'GOLD!', full: 'FULL' } as const;
/** The colours of the words, and of the sparks: an everyday spin's, a gold one's, and the grey of a medal that started nothing. */
export const ENTRY_INK = { start: '#fff3a8', gold: '#ffd24a', full: '#8f8aa8' } as const;

/** Whether an entry is told as gold: its spin is gold from the start, or it turned a held spin gold. */
const goldEntry = (entry: Entry): boolean => entry.gold || entry.lucky;
/** Whether an entry lights a lamp of the hold. A medal that found the hold full, and nothing in it left to turn gold, does not. */
const lightsLamp = (entry: Entry): boolean => entry.held || entry.gold;

/**
 * Notes a medal that has just dropped into its START slot, which is when the
 * machine takes it (session.ts): a ride after the lip's rule counted it, or
 * as it came over the lip where nothing may move and it is not seen to ride.
 * The cabinet answers it in this frame (`dropEntries`), once it has been told
 * what the machine holds now (`holdShown`).
 */
export function enterGate(stage: Stage, entry: Entry): void {
  if (entry.gate < 0 || entry.gate >= stage.gateGlow.length) return;
  stage.entries.push({ gate: entry.gate, held: entry.held, gold: entry.gold, lucky: entry.lucky, dropped: false, run: -1, from: { x: 0, y: 0 }, lamp: false });
}

/** The lamp of the hold a spark has reached shines for a moment, wherever it is in the row. */
function lightLamp(stage: Stage, entry: Arrival): void {
  stage.holdGlow[lampFor(stage, entry)] = GLOW_TIME;
}

/**
 * The lamp of the hold an entry's spark is bound for, from the left. A gold
 * one is bound for the first lamp that is not gold yet, which it turns: the
 * gold spins are the first in the row. Any other is bound for the first lamp
 * that is not lit. The entries before it that are bound for the same end of
 * the row get there first, and it takes the lamp after theirs.
 */
export function lampFor(stage: Stage, entry: Arrival): number {
  const gold = goldEntry(entry);
  let ahead = 0;
  for (const other of stage.entries) {
    if (other === entry) break;
    if (gold ? goldEntry(other) : other.held) ahead++;
  }
  return Math.min(stage.holdGlow.length - 1, (gold ? stage.hold.gold : stage.hold.stock) + ahead);
}

/**
 * Answers the medals that have dropped into a START slot in this frame, with
 * the machine's clock at `time`, and gives them back with what each sends up
 * to the hold: a spark, or nothing. What the cabinet is seen to say starts
 * here. The slot bursts with light and a word stands over it; and a spark
 * sets out for the hold's lamps, unless the medal found the hold full and
 * nothing to turn gold, which is a dull word and nothing more. Nor does a
 * spark set out for a spin the screen has taken already, as it does in the
 * step the medal drops when the screen is free and the machine holds nothing
 * else: that spin has no lamp, and what answers the medal is on the screen.
 * With `calm` nothing flies: no sparks from the slot and none up to the
 * hold, whose lamp is lit at once.
 */
export function dropEntries(stage: Stage, time: number, calm = false): Arrival[] {
  const dropped: Arrival[] = [];
  for (const entry of stage.entries) {
    if (entry.dropped) continue;
    entry.dropped = true;
    dropped.push(entry);
    const mouth = mouthSpot(entry.gate, time);
    const at = project(mouth.x, mouth.height + CATCHER.rim.high, mouth.depth);
    const gold = goldEntry(entry);
    const lights = lightsLamp(entry);
    const text = !lights ? ENTRY_WORDS.full : entry.held ? ENTRY_WORDS.start : ENTRY_WORDS.gold;
    const size = !lights ? BURST.dull : gold ? BURST.big : BURST.plain;
    // The word stands over the slot, inside the picture. A slot says one thing at a time: the word of a medal that went
    // down it a moment ago gives way to this one, so a run of medals does not pile their words on one another.
    const wide = size * 0.36 * text.length;
    stage.popups = stage.popups.filter((popup) => popup.word?.gate !== entry.gate);
    stage.popups.push({ x: Math.min(VIEW.width - wide, Math.max(wide, at.x)), y: at.y - 10, text, age: 0, color: !lights ? ENTRY_INK.full : gold ? ENTRY_INK.gold : ENTRY_INK.start, word: { gate: entry.gate, size, still: calm } });
    if (!lights) continue;
    lightGate(stage, entry.gate);
    // The oldest of the medals still to be answered are the ones whose spins the screen has taken: this is one of them if any is.
    const spun = gold ? stage.hold.gilt > 0 : stage.hold.taken > 0;
    if (spun) {
      if (gold) stage.hold.gilt -= 1;
      else stage.hold.taken -= 1;
    }
    entry.lamp = !spun;
    if (calm) continue;
    entry.from = { x: at.x, y: at.y };
    if (!spun) entry.run = 0;
    const own = SLOT_LIGHT.own[entry.gate % SLOT_LIGHT.own.length];
    const count = gold ? BURST.gold : BURST.sparks;
    for (let i = 0; i < count; i++) {
      // A fan of them, upward and to either side, no two alike and the same every time.
      const angle = -Math.PI / 2 + ((i + 0.5) / count - 0.5) * 2.6;
      const speed = 70 + ((i * 53 + entry.gate * 17) % 60);
      addSpark(stage, { x: at.x, y: at.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: 0.5, size: gold ? 3 : 2.4, color: i % 3 === 0 ? '#ffffff' : gold || i % 3 === 1 ? ENTRY_INK.gold : own });
    }
  }
  // With nothing to fly, a lamp is lit as its medal drops; and what has nothing more to say is forgotten.
  if (dropped.length > 0) {
    for (const entry of stage.entries) if (entry.dropped && entry.run < 0 && entry.lamp) lightLamp(stage, entry);
    stage.entries = stage.entries.filter((entry) => !entry.dropped || entry.run >= 0);
  }
  return dropped;
}

/**
 * How many of the spins the machine holds the hold's lamps show, and how
 * many of those as gold, given what the machine has: `stock` spins held,
 * `gold` of them gold. The machine has a medal's spin from the moment the
 * medal dropped into its slot, and the lamps do not show it until its spark
 * has reached them. So every entry that is still to be answered, or whose
 * spark is on its way, is one lamp fewer, and each of those that is gold one
 * gold lamp fewer; never fewer than none. If the machine holds fewer spins
 * than there are such entries, the screen has taken the rest already: a
 * medal that finds the screen free starts its spin as it drops. The stage
 * remembers the answer: it is where the sparks are bound, and which of them
 * have nowhere to go.
 */
export function holdShown(stage: Stage, stock: number, gold: number): Stage['hold'] {
  let held = 0;
  let gilt = 0;
  for (const entry of stage.entries) {
    if (entry.held) held++;
    if (goldEntry(entry)) gilt++;
  }
  const shown = Math.max(0, stock - held);
  stage.hold = { stock: shown, gold: Math.min(shown, Math.max(0, gold - gilt)), taken: Math.max(0, held - stock), gilt: Math.max(0, gilt - gold) };
  return stage.hold;
}

/** Starts the cabinet's lights for a tower coming down, a fever or the jackpot. */
export function celebrate(stage: Stage, kind: Party): void {
  // A jackpot is not cut short by a tower falling in the middle of it.
  if (stage.party && PARTY_TIME[stage.party.kind] > PARTY_TIME[kind]) return;
  stage.party = { kind, left: PARTY_TIME[kind] };
}

function addSpark(stage: Stage, spark: Spark): void {
  if (stage.sparks.length < MAX_SPARKS) stage.sparks.push(spark);
}

/** How far a medal can be from a cheek of the tray, where it was last seen, and still have gone over the edge on the other side of it: more than it moves in a frame. */
export const CHEEK_HAIR = 1;

/** A medal that has just left the field: where it was last seen, whether it went over the front edge, and whether it was won. */
interface Gone {
  id: number;
  last: Seen;
  front: boolean;
  pays: boolean;
}

/**
 * Holds the medals shown going into the tray to the number the machine has just counted as won. The stage sees a
 * medal where it lay a frame ago and the machine judges it where it went over, a hair further on, so a medal that
 * left right beside a cheek can have gone the other side of it. Where the two counts differ, the medals nearest a
 * cheek are the ones that did, and no medal further from one than a hair is ever told otherwise.
 */
function settleGone(gone: Gone[], won: number): void {
  const plain = gone.filter((medal) => medal.front && !medal.last.ball && !medal.last.jewel);
  let over = plain.filter((medal) => medal.pays).length - won;
  if (over === 0) return;
  const off = (medal: Gone): number => Math.abs(fromSide(medal.last.x, medal.last.x < W / 2 ? -1 : 1) - SIDE_HOLE.reach);
  const near = plain.filter((medal) => medal.pays === over > 0 && off(medal) <= CHEEK_HAIR).sort((a, b) => off(a) - off(b));
  for (const medal of near) {
    if (over === 0) break;
    medal.pays = !medal.pays;
    over -= over > 0 ? 1 : -1;
  }
}

/**
 * Notes which medals have left the field since the last frame and starts each
 * one on its way: over the middle of the front edge into the tray; over the
 * front edge at a corner, down the side hole's mouth there; or off an open
 * side on to its chute. It is the engine's own rule (`frontPays`) that says
 * which of the first two. A ball or a jewel is collected wherever it goes
 * over, and at a corner it crosses the mouth on its bars. `won` is the count
 * the session just credited, which floats up from the tray, and as many
 * medals as that are shown going into it; left out, the stage goes by where
 * each medal was last seen.
 */
export function trackMedals(stage: Stage, machine: Machine, won?: number): void {
  // Which arm each medal on its way in is on. It is forgotten once the medal is neither on a rail nor in the air.
  for (const medal of machine.rolling) stage.fed.set(medal.id, medal.arm);
  if (stage.fed.size > machine.rolling.length) {
    for (const id of stage.fed.keys()) {
      if (!machine.rolling.some((medal) => medal.id === id) && !machine.falling.some((medal) => medal.id === id)) stage.fed.delete(id);
    }
  }
  const present = new Map<number, Seen>();
  for (const medal of machine.medals) {
    const known = stage.seen.get(medal.id);
    if (known) {
      known.x = medal.x;
      known.y = medal.y;
      known.tower = medal.stack > 1;
      present.set(medal.id, known);
      stage.seen.delete(medal.id);
    } else {
      present.set(medal.id, { x: medal.x, y: medal.y, ball: medal.ball, jewel: medal.jewel === true, tower: medal.stack > 1 });
    }
  }
  const gone: Gone[] = [];
  for (const [id, last] of stage.seen) {
    // A tower that is gone went over the lip, and its medals are already in the air.
    if (last.tower) continue;
    const prize = last.ball || last.jewel;
    // It left by the edge it was nearest: the front, or an open side. A ball or a jewel fits no side.
    const front = prize || D - last.y <= Math.min(last.x, W - last.x);
    gone.push({ id, last, front, pays: prize || (front && frontPays(last.x)) });
  }
  if (won !== undefined) settleGone(gone, won);
  for (const { id, last, front, pays: isWon } of gone) {
    const side = last.x < W / 2 ? -1 : 1;
    // Over the front edge at a corner: a medal that was not won there went down the mouth, and a prize crossed it.
    const corner = front && (last.ball || last.jewel ? holeAt(last.x) !== 0 : !isWon);
    stage.exits.push({ id, x: last.x, y: last.y, kind: isWon ? 'won' : 'lost', side, ball: last.ball, ...(last.jewel ? { jewel: true } : {}), ...(corner ? { corner: true } : {}), age: 0 });
    if (isWon) {
      stage.trayGlow = GLOW_TIME;
      // A glint where it went over.
      const at = project(last.x, T, Math.min(D, last.y));
      for (let i = 0; i < (last.ball || last.jewel ? 14 : 2); i++) {
        const angle = -Math.PI / 2 + (((id * 7 + i * 37) % 100) / 100 - 0.5) * 2.2;
        const speed = 50 + ((id * 13 + i * 29) % 70);
        addSpark(stage, {
          x: at.x,
          y: at.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          life: 0.55,
          size: last.ball ? 3 : 2.2,
          color: last.jewel ? JEWEL_SPARKS[i % JEWEL_SPARKS.length] : SPARK_COLORS[(id + i) % 3],
        });
      }
    } else {
      stage.sideGlow[side < 0 ? 0 : 1] = GLOW_TIME;
    }
  }
  stage.seen = present;
  stage.tally += won ?? 0;
}

/**
 * Seconds something that has left the field is still drawn for. A ball or a jewel that went over a side hole's mouth
 * is on the bars across it for as long as it takes to roll to the tray, which is longer the nearer the side it went
 * over; everything else has the same moment to fall out of sight.
 */
export function exitTime(exit: ExitingMedal, calm = false): number {
  if (!exit.corner || !(exit.ball || exit.jewel)) return EXIT_TIME;
  return Math.max(EXIT_TIME, railTime(fromSide(exit.x, exit.side), exit.ball ? BALL_RADIUS : JEWEL_CUT.girdle, calm));
}

/** Ages the lights, the sparks and whatever is on its way out. `calm` leaves the confetti out. */
export function ageStage(stage: Stage, dt: number, calm = false): void {
  stage.clock += dt;
  for (const exit of stage.exits) exit.age += dt;
  // The oldest is the first to go, unless it is a prize on the bars across a side hole's mouth, which has longer.
  if (stage.exits.some((exit) => exit.age >= EXIT_TIME)) stage.exits = stage.exits.filter((exit) => exit.age < exitTime(exit, calm));
  for (let i = 0; i < stage.gateGlow.length; i++) stage.gateGlow[i] = Math.max(0, stage.gateGlow[i] - dt);
  for (let i = 0; i < stage.holdGlow.length; i++) stage.holdGlow[i] = Math.max(0, stage.holdGlow[i] - dt);
  // The sparks on their way up to the hold: one that gets there lights its lamp, and that is the last of its entry.
  if (stage.entries.some((entry) => entry.run >= 0)) {
    const there: Arrival[] = [];
    for (const entry of stage.entries) {
      if (entry.run < 0) continue;
      entry.run += dt;
      if (entry.run >= BURST.run) there.push(entry);
    }
    for (const entry of there) lightLamp(stage, entry);
    if (there.length > 0) stage.entries = stage.entries.filter((entry) => !there.includes(entry));
  }
  stage.trayGlow = Math.max(0, stage.trayGlow - dt);
  stage.sideGlow[0] = Math.max(0, stage.sideGlow[0] - dt);
  stage.sideGlow[1] = Math.max(0, stage.sideGlow[1] - dt);
  stage.jewelGlow = Math.max(0, stage.jewelGlow - dt);
  stage.jewelShow = Math.max(0, stage.jewelShow - dt);

  // The medals won in the last moment float up from the tray as one count.
  stage.tallyAge += dt;
  if (stage.tally > 0 && stage.tallyAge >= 0.35) {
    const at = project(W / 2, 0, D);
    stage.popups.push({ x: at.x + (((stage.clock * 977) % 1) - 0.5) * 220, y: at.y - 6, text: `+${stage.tally}`, age: 0 });
    stage.tally = 0;
    stage.tallyAge = 0;
  }
  for (const popup of stage.popups) popup.age += dt;
  if (stage.popups.some((popup) => popup.age >= (popup.word ? BURST.word : 1))) stage.popups = stage.popups.filter((popup) => popup.age < (popup.word ? BURST.word : 1));

  if (stage.party) {
    stage.party.left -= dt;
    if (stage.party.left <= 0) {
      stage.party = null;
    } else if (!calm && stage.party.kind !== 'crash') {
      // Confetti from the top of the cabinet for as long as the party lasts.
      const count = stage.party.kind === 'jackpot' ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const seed = stage.clock * 1000 + i * 131;
        addSpark(stage, {
          x: ((seed * 0.6180339) % 1) * VIEW.width,
          y: -6,
          vx: (((seed * 0.317) % 1) - 0.5) * 60,
          vy: 90 + ((seed * 0.713) % 1) * 120,
          age: 0,
          life: 2.6,
          size: 3 + ((seed * 0.11) % 1) * 2.5,
          color: SPARK_COLORS[Math.floor(seed) % SPARK_COLORS.length],
        });
      }
    }
  }
  for (const spark of stage.sparks) {
    spark.age += dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 140 * dt;
  }
  if (stage.sparks.length > 0) stage.sparks = stage.sparks.filter((spark) => spark.age < spark.life && spark.y < VIEW.height + 10);
}

/** The turn each medal lies at, fixed by its id so a pile does not look stamped. */
export const turnOf = (id: number): number => id * 2.399963;

/** How many bulbs run along the tray, under the front edge between the cheeks. */
export const TRAY_BULBS = 18;
/**
 * A jewel that went over the front edge at a side hole's mouth, as the stone it is: on the bars across the mouth,
 * tumbling along them toward the tray, and down into it past the cheek. With motion reduced it crosses the bars the
 * way it was going.
 */
export function railedJewel(exit: ExitingMedal, calm = false): JewelSpot {
  const at = railed(exit.x, exit.y, exit.side, exit.age, JEWEL_CUT.girdle, calm);
  // It rolls about its girdle: a turn for each time it has gone its own way round.
  const rolled = at.rolled / JEWEL_CUT.girdle;
  return { id: exit.id, x: at.x, height: at.height, depth: at.depth, turn: turnOf(exit.id), tilt: 0.1 + rolled, heading: calm ? 0 : (exit.side * Math.PI) / 2, light: 1 };
}

/** The stage's medal as it was struck, and in every tone: the first of the faces is the one the stage calls its medal. */
function facesOf(struck: HTMLCanvasElement): Pick<Stage, 'medal' | 'faces'> {
  const faces = medalFaces(struck);
  return { medal: faces[0], faces };
}

/**
 * Stamps one medal's face where `point` is, squashed to `tilt` and turned by
 * `turn`. Given the medal's `id`, the face is the one of its own tone.
 */
function stamp(g: CanvasRenderingContext2D, stage: Stage, point: Projected, tilt: number, turn: number, shift = 0, narrow = 1, id = -1): void {
  const k = stage.ratio;
  const rx = R * point.scale * k;
  const ry = rx * tilt;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // `narrow` squeezes it sideways: a medal turned part of the way edge on to the player.
  g.setTransform(rx * cos * narrow, ry * sin, -rx * sin * narrow, ry * cos, (point.x + shift) * k, point.y * k);
  g.drawImage(id < 0 ? stage.medal : (stage.faces[faceOf(id)] ?? stage.medal), -1, -1, 2, 2);
}

const byDepth = (a: Medal, b: Medal): number => a.y - b.y;

/** A prize ball standing at `height` above the lower table, with the shadow it throws when it rests on something. */
function drawBall(g: CanvasRenderingContext2D, stage: Stage, x: number, height: number, depth: number, resting: boolean, shift = 0): void {
  const k = stage.ratio;
  if (resting) {
    const foot = project(x, height, depth);
    const rx = BALL_RADIUS * foot.scale * 0.95;
    g.setTransform(k, 0, 0, k, shift * k, 0);
    g.fillStyle = 'rgba(0, 0, 14, 0.38)';
    g.beginPath();
    g.ellipse(foot.x, foot.y, rx, rx * foot.tilt, 0, 0, TAU);
    g.fill();
  }
  const centre = project(x, height + BALL_RADIUS, depth);
  const r = BALL_RADIUS * centre.scale * k;
  g.setTransform(r, 0, 0, r, (centre.x + shift) * k, centre.y * k);
  g.drawImage(stage.ball, -1, -1, 2, 2);
}

/** The medals of a tower above its lowest one: a column with a rim line for each, and the top medal's face. */
function drawTower(g: CanvasRenderingContext2D, stage: Stage, tower: Medal, base: number, shift: number): void {
  const k = stage.ratio;
  const foot = project(tower.x, base + T, tower.y);
  const head = project(tower.x, base + tower.stack * T, tower.y);
  const rx0 = R * foot.scale;
  const ry0 = rx0 * foot.tilt;
  const rx1 = R * head.scale;
  const ry1 = rx1 * head.tilt;
  g.setTransform(k, 0, 0, k, shift * k, 0);
  // The shadow it throws across the medals beside it.
  g.fillStyle = 'rgba(0, 0, 14, 0.3)';
  g.beginPath();
  g.ellipse(foot.x + rx0 * 0.9, foot.y + ry0 * 0.35, rx0 * 1.5, ry0 * 0.9, 0, 0, TAU);
  g.fill();
  const shade = g.createLinearGradient(foot.x - rx0, 0, foot.x + rx0, 0);
  shade.addColorStop(0, '#7a4f06');
  shade.addColorStop(0.28, '#ffe07a');
  shade.addColorStop(0.42, '#f6cb55');
  shade.addColorStop(0.7, '#c98c14');
  shade.addColorStop(1, '#6b4304');
  g.fillStyle = shade;
  g.beginPath();
  g.moveTo(head.x - rx1, head.y);
  g.lineTo(foot.x - rx0, foot.y);
  g.ellipse(foot.x, foot.y, rx0, ry0, 0, Math.PI, 0, true);
  g.lineTo(head.x + rx1, head.y);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(88, 54, 0, 0.6)';
  // The line between one medal and the next is three tenths of a medal's thickness as it is seen there, and no wider
  // than a pixel of the drawing: however thin the medals are, the column is brass with lines in it and not the other way about.
  g.lineWidth = Math.min(1, T * rise(foot) * 0.3);
  g.beginPath();
  for (let i = 1; i < tower.stack - 1; i++) {
    const f = i / (tower.stack - 1);
    const cx = foot.x + (head.x - foot.x) * f;
    const cy = foot.y + (head.y - foot.y) * f;
    const rx = rx0 + (rx1 - rx0) * f;
    g.moveTo(cx + rx, cy);
    g.ellipse(cx, cy, rx, ry0 + (ry1 - ry0) * f, 0, 0, Math.PI);
  }
  g.stroke();
  stamp(g, stage, head, head.tilt, turnOf(tower.id), shift);
}

/**
 * How far above a medal lying settled on the table this one's face is drawn.
 * One on top of the pile is a medal's thickness higher. One that has just come
 * down is a little higher still, and one dropping into a gap comes down from
 * the top of the pile as it makes room for itself.
 */
export function liftOf(medal: Medal): number {
  const settling = medal.grown < 1 ? 1 - (medal.grown - SETTLE.from) / (1 - SETTLE.from) : 0;
  return medal.tier === 1 ? T + settling * RIDE * 0.5 : settling * T;
}

/** The shadow a medal throws on the table it lies on: how far down and across it lies, in thicknesses of a medal, and what it is drawn in. */
const TABLE_SHADE = { reach: 1.9, color: 'rgba(0, 4, 18, 0.34)' } as const;

/**
 * A table's medals, from the table up: the lower tier with the shadows it
 * throws, the medals dropping into it, the upper tier with the shadows it
 * throws on the lower, and last whatever stands above them all — towers and
 * balls. Within a tier every rim is one fill, then the faces from the back
 * forward.
 */
function drawMedals(g: CanvasRenderingContext2D, stage: Stage, medals: Medal[], base: number, shift: number): void {
  if (medals.length === 0) return;
  const k = stage.ratio;
  const points: (Projected | null)[] = [];
  const drops: number[] = [];
  for (const medal of medals) {
    // A medal that has just come over the lip is still on its way down to the lower table.
    const drop = medal.level === 0 && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL ? P * (1 - (medal.sinceDrop / LIP_FALL) ** 2) : 0;
    drops.push(drop);
    // A ball is drawn after the medals, and a jewel by whoever draws the field: neither has a medal's face.
    points.push(medal.ball || medal.jewel ? null : project(medal.x, base + drop + T + liftOf(medal), medal.y));
  }
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);

  /** The shadows the chosen medals throw: `reach` says how far down and across, in thicknesses of a medal. */
  const shadows = (chosen: (medal: Medal) => boolean, reach: number, shade: string) => {
    flat();
    g.fillStyle = shade;
    g.beginPath();
    for (let i = 0; i < medals.length; i++) {
      const point = points[i];
      if (!point || !chosen(medals[i])) continue;
      const rx = R * point.scale * 1.06;
      const thickness = T * rise(point);
      g.moveTo(point.x + rx * 1.12, point.y + thickness * reach);
      g.ellipse(point.x + rx * 0.12, point.y + thickness * reach, rx, rx * point.tilt, 0, 0, TAU);
    }
    g.fill();
  };
  /** The chosen medals themselves: rims, then faces. */
  const pile = (chosen: (medal: Medal) => boolean) => {
    flat();
    g.fillStyle = '#8a5a08';
    g.beginPath();
    for (let i = 0; i < medals.length; i++) {
      const point = points[i];
      if (!point || !chosen(medals[i])) continue;
      const rx = R * point.scale;
      const thickness = T * rise(point);
      g.moveTo(point.x + rx, point.y + thickness);
      g.ellipse(point.x, point.y + thickness, rx, rx * point.tilt, 0, 0, TAU);
      g.rect(point.x - rx, point.y, rx * 2, thickness);
    }
    g.fill();
    for (let i = 0; i < medals.length; i++) {
      const point = points[i];
      if (point && chosen(medals[i])) stamp(g, stage, point, point.tilt, turnOf(medals[i].id), shift, 1, medals[i].id);
    }
  };

  const lying = (medal: Medal) => medal.tier === 0 && medal.grown >= 1;
  const dropping = (medal: Medal) => medal.tier === 0 && medal.grown < 1;
  const onTop = (medal: Medal) => medal.tier === 1;
  shadows(lying, TABLE_SHADE.reach, TABLE_SHADE.color);
  pile(lying);
  // A medal on its way into the lower tier is still above its neighbours, so it is drawn over them.
  pile(dropping);
  // The upper tier throws its shadow on the medals it lies on.
  shadows(onTop, 2.2, 'rgba(20, 10, 0, 0.42)');
  pile(onTop);
  for (let i = 0; i < medals.length; i++) {
    const medal = medals[i];
    if (medal.ball) drawBall(g, stage, medal.x, base + drops[i], medal.y, drops[i] === 0, shift);
    else if (medal.stack > 1) drawTower(g, stage, medal, base, shift);
  }
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * A row of bulbs between two points. A glow travels along it: every bulb
 * brightens and dims smoothly, a third of a cycle after its neighbour, so the
 * row reads as running lights without anything switching hard on and off.
 */
function bulbs(g: CanvasRenderingContext2D, from: Projected, to: Projected, count: number, wave: number, colors: readonly string[], size: number): void {
  for (let i = 0; i < count; i++) {
    const f = (i + 0.5) / count;
    const x = from.x + (to.x - from.x) * f;
    const y = from.y + (to.y - from.y) * f;
    const glow = 0.5 + 0.5 * Math.sin(wave - (i * TAU) / 3);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(60, 40, 110, 0.9)';
    g.beginPath();
    g.arc(x, y, size * 0.85, 0, TAU);
    g.fill();
    g.globalAlpha = 0.16 * glow;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, size * 2.1, 0, TAU);
    g.fill();
    g.globalAlpha = 0.25 + 0.75 * glow;
    g.fillStyle = colors[i % colors.length];
    g.beginPath();
    g.arc(x, y, size, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

/**
 * Stamps a medal that is held some way other than lying flat: its middle at
 * `at`, turned by `turn` in its own plane and tipped over by `tilt` about the
 * level line along `heading`, which are the angles `attitude` in mat4.ts
 * takes. Its far rim shows behind its face. Lying flat it comes out as
 * `stamp` draws it, so a medal can go from the one to the other without a
 * jump. `light` is how much light it gets, from 1 in the open down to none:
 * with less it is darker, not fainter, so that it is seen against something
 * bright. Given the medal's `id`, the face is the one of its own tone.
 */
function stampHeld(g: CanvasRenderingContext2D, stage: Stage, at: Spot, turn: number, tilt: number, heading: number, shift: number, light = 1, id = -1): void {
  const k = stage.ratio;
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // Two lines across its face at right angles, each a radius long: the first lies along the line it is tipped about when it is not turned.
  const ax = ch * cos - ct * sh * sin;
  const ay = -st * sin;
  const az = sh * cos + ct * ch * sin;
  const bx = -ch * sin - ct * sh * cos;
  const by = -st * cos;
  const bz = -sh * sin + ct * ch * cos;
  // The way its face looks, and whether that is toward the camera: the rim is on the side that is not.
  const nx = -sh * st;
  const ny = ct;
  const nz = ch * st;
  const away = nx * (EYE_AT.x - at.x) + ny * (EYE_AT.height - at.height) + nz * (EYE_AT.depth - at.depth) < 0 ? T : -T;
  const o = project(at.x, at.height, at.depth);
  const a = project(at.x + ax * R, at.height + ay * R, at.depth + az * R);
  const b = project(at.x + bx * R, at.height + by * R, at.depth + bz * R);
  const rim = project(at.x + nx * away, at.height + ny * away, at.depth + nz * away);
  g.setTransform((a.x - o.x) * k, (a.y - o.y) * k, (b.x - o.x) * k, (b.y - o.y) * k, (rim.x + shift) * k, rim.y * k);
  g.fillStyle = '#8a5a08';
  g.beginPath();
  g.arc(0, 0, 1, 0, TAU);
  g.fill();
  g.setTransform((a.x - o.x) * k, (a.y - o.y) * k, (b.x - o.x) * k, (b.y - o.y) * k, (o.x + shift) * k, o.y * k);
  g.drawImage(id < 0 ? stage.medal : (stage.faces[faceOf(id)] ?? stage.medal), -1, -1, 2, 2);
  if (light >= 1) return;
  g.globalAlpha = 1 - Math.max(0, light);
  g.fillStyle = '#1c0f02';
  g.beginPath();
  g.arc(0, 0, 1, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

/**
 * The shadow an arm's rail lays on the tables under it: on the pusher where
 * it comes down there, and on the lower table in front of that, as far as
 * the table goes. It is what shows that the rail is over the field and not
 * lying on it.
 */
function railShadow(g: CanvasRenderingContext2D, machine: Machine, arm: Arm, front: number): void {
  const rail = railFrame(arm, machine.tips[arm]);
  const steps = 14;
  let drawing = false;
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const far = CHANNEL.from + ((rail.length + CHANNEL.past - CHANNEL.from) * i) / steps;
    const x = rail.from.x + rail.along.x * far + rail.foot.x * R;
    const height = rail.from.height + rail.along.height * far + rail.foot.height * R;
    const depth = rail.from.depth + rail.along.depth * far + rail.foot.depth * R;
    const onPusher = depth + (height - P) * SUN.depth < front;
    const level = onPusher ? P : 0;
    const sx = x + (height - level) * SUN.x;
    const sd = depth + (height - level) * SUN.depth;
    if (sd > D || sx < 0 || sx > W) {
      drawing = false;
      continue;
    }
    const point = project(sx, level + T * 2, sd);
    if (drawing) g.lineTo(point.x, point.y);
    else g.moveTo(point.x, point.y);
    drawing = true;
  }
  g.stroke();
}

/**
 * One feed arm, its tip exactly where the machine has it: a thin channel of
 * polished metal from its slot to its tip, with the wall a medal leans on, a
 * tube of light along the top of that, the floor the medal's edge runs on
 * and a low lip in front of it; the medals rolling in it; and a lamp at the
 * tip, which marks where a medal will leave. The machine swings the arms,
 * and a medal is let go where its arm's tip is, so nothing here eases a tip
 * on its own: the rail a medal leaves and the spot its fall starts from are
 * one place. `lit` is how bright its light is, from 0 to 1.
 */
function drawArm(g: CanvasRenderingContext2D, stage: Stage, machine: Machine, arm: Arm, lit: number, shift: number): void {
  const k = stage.ratio;
  const tipX = machine.tips[arm];
  const rail = railFrame(arm, tipX);
  /** The point `far` along the rail from the collar, `down` from the line a medal's middle runs on toward its foot, and `across` to the side its face looks to. */
  const at = (far: number, down: number, across: number): Projected =>
    project(
      rail.from.x + rail.along.x * far + rail.foot.x * down + rail.face.x * across,
      rail.from.height + rail.along.height * far + rail.foot.height * down + rail.face.height * across,
      rail.from.depth + rail.along.depth * far + rail.foot.depth * down + rail.face.depth * across,
    );
  const { half, wall, lip, from } = CHANNEL;
  const end = rail.length + CHANNEL.past;
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);
  flat();
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // The wall the medals lean on, and the floor their edges run on.
  const plate = [at(from, R - wall, -half), at(end, R - wall, -half), at(end, R, -half), at(from, R, -half)];
  const steel = g.createLinearGradient(plate[0].x, plate[0].y, plate[3].x, plate[3].y);
  steel.addColorStop(0, '#c2cbe2');
  steel.addColorStop(1, '#4b5574');
  g.fillStyle = steel;
  path(g, plate);
  g.fill();
  g.fillStyle = '#f4f7fd';
  path(g, [at(from, R, -half), at(end, R, -half), at(end, R, half), at(from, R, half)]);
  g.fill();
  // The groove a medal's edge runs in.
  g.strokeStyle = '#1a2036';
  g.lineWidth = 1;
  line(g, at(from, R, 0), at(end, R, 0));
  // The tube of light along the top of the wall.
  const tube = [at(from, R - wall - 0.2, -half), at(end, R - wall - 0.2, -half)];
  g.strokeStyle = `rgba(64, 226, 255, ${0.12 + 0.34 * lit})`;
  g.lineWidth = 8;
  line(g, tube[0], tube[1]);
  g.strokeStyle = lit > 0.5 ? '#ecfcff' : '#9fb6cc';
  g.lineWidth = 2.4;
  line(g, tube[0], tube[1]);

  // The medals on the rail, each turned as far as it has rolled and leaning back on the wall. One still at the slot is drawn with the slot.
  for (const medal of machine.rolling) {
    if (medal.arm !== arm) continue;
    const held = fedSpot(arm, tipX, medal.remaining);
    if (held.leg === 'arm') stampHeld(g, stage, held, turnOf(medal.id) + held.turn, held.tilt, held.heading, shift);
  }
  flat();

  // The lip in front of them, and the lamp at the tip.
  g.fillStyle = '#c9d2e6';
  path(g, [at(from, R - lip, half), at(end, R - lip, half), at(end, R, half), at(from, R, half)]);
  g.fill();
  const lamp = at(end, R - wall - 0.9, -half);
  g.fillStyle = `rgba(64, 226, 255, ${0.15 + 0.35 * lit})`;
  g.beginPath();
  g.arc(lamp.x, lamp.y, 2 * lamp.scale, 0, TAU);
  g.fill();
  g.fillStyle = lit > 0.5 ? '#ecfcff' : '#6f93a8';
  g.beginPath();
  g.arc(lamp.x, lamp.y, 0.8 * lamp.scale, 0, TAU);
  g.fill();
}

/**
 * The slot at the near end of an arm, which is a funnel tipped back to look
 * up at the player: a body of polished metal that flares toward the player
 * to a ring, a ring of light inside that, and inside the light a throat that
 * narrows to the mouth, which is dark, stands upright, and is as tall as a
 * medal and several times as wide as one is thick. The ring of light of
 * either slot glows, since either takes a medal at any moment, and flashes
 * gold as one is taken. A medal being fed is shown face on in front of the
 * slot and turns edge on as it goes in. Once it is past the ring, the near
 * side of the funnel is in front of the foot of it, and once it is through
 * the mouth the slot hides it.
 */
function drawSlot(g: CanvasRenderingContext2D, stage: Stage, machine: Machine, arm: Arm, shift: number): void {
  const k = stage.ratio;
  const tipX = machine.tips[arm];
  const { ring, face, back, waist, mouth, deep } = SLOT;
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);
  const at = (across: number, up: number, out: number): Projected => {
    const spot = slotSpot(arm, across, up, out);
    return project(spot.x, spot.height, spot.depth);
  };
  /**
   * Makes the canvas draw on the slot's face, or on a plane level with it
   * `out` from the collar: one unit across it to the right, one unit up it.
   * Gives back the middle of it on the drawing, and how far a unit across
   * and a unit up are there.
   */
  const onFace = (out: number) => {
    const o = at(0, 0, out);
    const u = at(1, 0, out);
    const v = at(0, 1, out);
    const frame = { o, ux: u.x - o.x, uy: u.y - o.y, vx: v.x - o.x, vy: v.y - o.y };
    g.setTransform(frame.ux * k, frame.uy * k, frame.vx * k, frame.vy * k, (o.x + shift) * k, o.y * k);
    return frame;
  };
  const round = (radius: number) => {
    g.beginPath();
    g.arc(0, 0, radius, 0, TAU);
  };
  const taking = machine.rolling.some((medal) => medal.arm === arm && fedSpot(arm, tipX, medal.remaining).leg === 'slot');
  const lit = taking ? 1 : REST_LIGHT;

  // Its body, from the back of it to its face.
  const rear = at(0, 0, -back);
  const front = at(0, 0, face);
  const raised = at(0, 1, -back);
  const near = ring * front.scale;
  const far = waist * rear.scale;
  flat();
  const steel = g.createLinearGradient(front.x - near, 0, front.x + near, 0);
  steel.addColorStop(0, '#5d6789');
  steel.addColorStop(0.35, '#f4f7fd');
  steel.addColorStop(1, '#6c7693');
  g.fillStyle = steel;
  g.beginPath();
  g.ellipse(rear.x, rear.y, far, waist * Math.hypot(raised.x - rear.x, raised.y - rear.y), 0, 0, TAU);
  g.fill();
  path(g, [
    { ...rear, x: rear.x - far },
    { ...rear, x: rear.x + far },
    { ...front, x: front.x + near },
    { ...front, x: front.x - near },
  ]);
  g.fill();

  // Its face: the ring, the ring of light inside it, and the throat inside that, brightest at its rim.
  const plane = onFace(face);
  const chrome = g.createRadialGradient(-ring * 0.35, ring * 0.35, ring * 0.1, 0, 0, ring);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(0.45, '#aab4d0');
  chrome.addColorStop(1, '#343c5e');
  g.fillStyle = chrome;
  round(ring);
  g.fill();
  for (const [width, colour] of [
    [ring * (SLOT.light - SLOT.throat) * 1.5, taking ? 'rgba(255, 244, 150, 0.5)' : `rgba(64, 226, 255, ${0.15 + 0.4 * lit})`],
    [ring * (SLOT.light - SLOT.throat) * 0.7, taking ? '#fffbe0' : `rgba(125, 240, 255, ${0.3 + 0.7 * lit})`],
  ] as const) {
    g.strokeStyle = colour;
    g.lineWidth = width;
    round((ring * (SLOT.light + SLOT.throat)) / 2);
    g.stroke();
  }
  // Where the middle of the mouth is seen on the face: further in, so a little toward the far side of it.
  const inner = at(0, 0, face - deep);
  const det = plane.ux * plane.vy - plane.vx * plane.uy;
  const dx = inner.x - plane.o.x;
  const dy = inner.y - plane.o.y;
  const across = det === 0 ? 0 : (dx * plane.vy - dy * plane.vx) / det;
  const up = det === 0 ? 0 : (plane.ux * dy - plane.uy * dx) / det;
  const throat = g.createRadialGradient(across, up, mouth.wide / 2, 0, 0, ring * SLOT.throat);
  throat.addColorStop(0, '#0a2338');
  throat.addColorStop(0.55, '#2f7fae');
  throat.addColorStop(1, '#e6f8ff');
  g.fillStyle = throat;
  round(ring * SLOT.throat);
  g.fill();

  // The mouth, with a bright edge round it.
  onFace(face - deep);
  g.fillStyle = `rgba(234, 252, 255, ${0.4 + 0.6 * lit})`;
  g.beginPath();
  g.ellipse(0, 0, mouth.wide / 2 + 0.3, mouth.tall / 2 + 0.3, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#000000';
  g.beginPath();
  g.ellipse(0, 0, mouth.wide / 2, mouth.tall / 2, 0, 0, TAU);
  g.fill();

  // A medal that is being fed. In front of the ring all of it is seen; inside the funnel the near side of the funnel hides the foot of it.
  const lip = slotSpot(arm, 0, -ring * SLOT.throat, face);
  for (const medal of machine.rolling) {
    if (medal.arm !== arm) continue;
    const held = fedSpot(arm, tipX, medal.remaining);
    if (held.leg !== 'slot') continue;
    g.save();
    if (held.depth < lip.depth) {
      onFace(face);
      g.beginPath();
      g.arc(0, 0, ring * SLOT.throat, 0, TAU);
      g.rect(-ring * 3, 0, ring * 6, ring * 6);
      g.clip();
    }
    stampHeld(g, stage, held, turnOf(medal.id) + held.turn, held.tilt, held.heading, shift);
    g.restore();
  }
  flat();
}

// ── Jewels ──────────────────────────────────────────────────────────────────

/** The way to the cabinet's lamps, as the shadows on the tables have it: over the back of the field and a little to the left. */
const LAMP_WAY = (() => {
  const length = Math.hypot(SUN.x, 1, SUN.depth);
  return [-SUN.x / length, 1 / length, -SUN.depth / length] as const;
})();

/** The colour of a face of a stone that is lit this much: deep rose in the dark, pink in the light, white where a lamp is mirrored. */
function roseAt(light: number): string {
  const stops = [
    [0, 92, 6, 52],
    [0.45, 255, 46, 146],
    [0.8, 255, 160, 208],
    [1.1, 255, 255, 255],
  ];
  const at = Math.min(1.1, Math.max(0, light));
  let i = 1;
  while (i < stops.length - 1 && stops[i][0] < at) i++;
  const [from, to] = [stops[i - 1], stops[i]];
  const share = (at - from[0]) / (to[0] - from[0]);
  const mix = (channel: number) => Math.round(from[channel] + (to[channel] - from[channel]) * share);
  return `rgb(${mix(1)}, ${mix(2)}, ${mix(3)})`;
}

/**
 * A jewel, drawn face by face from the cut both renderers share: each face
 * of the crown that looks toward the player, as bright as the lamps make it,
 * with a glint where one of them is mirrored, and a dark line round the
 * stone so that it stands out from the gold it lies among. Lying on a table
 * it throws a shadow with its own colour in it. Unless the cabinet is calm
 * its faces flash by turns, as they do when the lamps drift.
 */
function drawJewel(g: CanvasRenderingContext2D, stage: Stage, spot: JewelSpot, resting: boolean, calm: boolean, shift: number): void {
  const k = stage.ratio;
  g.setTransform(k, 0, 0, k, shift * k, 0);
  const seen = (corner: readonly [number, number, number]): Projected => project(corner[0], corner[1], corner[2]);
  if (resting) {
    // The shadow lies on whatever the stone stands on, away from the lamps, and the light that came through the stone lies in it.
    const ground = spot.height - JEWEL_CUT.pavilion;
    const foot = project(spot.x + JEWEL_CUT.pavilion * SUN.x, ground + T, spot.depth + JEWEL_CUT.pavilion * SUN.depth);
    const rx = JEWEL_CUT.girdle * foot.scale;
    g.fillStyle = 'rgba(40, 0, 30, 0.4)';
    g.beginPath();
    g.ellipse(foot.x, foot.y, rx * 1.05, rx * 1.05 * foot.tilt, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255, 70, 170, 0.34)';
    g.beginPath();
    g.ellipse(foot.x + rx * 0.2, foot.y + rx * 0.15, rx * 0.6, rx * 0.6 * foot.tilt, 0, 0, TAU);
    g.fill();
  }
  let brightest = { light: 0, x: 0, y: 0, scale: 1 };
  g.lineJoin = 'round';
  JEWEL_FACETS.forEach((face, index) => {
    const { corners, normal } = facetInCabinet(spot, face);
    const middle = corners.reduce((sum, corner) => [sum[0] + corner[0] / corners.length, sum[1] + corner[1] / corners.length, sum[2] + corner[2] / corners.length], [0, 0, 0]);
    const toEye = [EYE_AT.x - middle[0], EYE_AT.height - middle[1], EYE_AT.depth - middle[2]];
    const far = Math.hypot(toEye[0], toEye[1], toEye[2]);
    const facing = (normal[0] * toEye[0] + normal[1] * toEye[1] + normal[2] * toEye[2]) / far;
    if (facing <= 0) return;
    const lamp = Math.max(0, normal[0] * LAMP_WAY[0] + normal[1] * LAMP_WAY[1] + normal[2] * LAMP_WAY[2]);
    // Half way between the lamps and the eye: a face that looks that way mirrors a lamp straight at the player.
    const half = [LAMP_WAY[0] + toEye[0] / far, LAMP_WAY[1] + toEye[1] / far, LAMP_WAY[2] + toEye[2] / far];
    const mirror = Math.max(0, (normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2]) / Math.hypot(half[0], half[1], half[2])) ** 30;
    const flash = calm ? 0 : Math.max(0, Math.sin(stage.clock * 2.6 + index * 2.4 + spot.id)) ** 8;
    const light = (0.2 + 0.5 * lamp + 0.9 * mirror + 0.6 * flash) * spot.light;
    const points = corners.map(seen);
    g.fillStyle = roseAt(light);
    path(g, points);
    g.fill();
    g.strokeStyle = 'rgba(255, 230, 245, 0.35)';
    g.lineWidth = 0.6;
    g.stroke();
    if (light > brightest.light) {
      const at = seen(middle as [number, number, number]);
      brightest = { light, x: at.x, y: at.y, scale: at.scale };
    }
  });
  // The girdle, all round: the line that tells the stone from the medals.
  g.strokeStyle = 'rgba(86, 4, 46, 0.85)';
  g.lineWidth = 1.1;
  path(
    g,
    JEWEL_GIRDLE.map((corner) => seen(pointInCabinet(spot, corner))),
  );
  g.stroke();
  // A glint on its brightest face: four rays.
  if (brightest.light > 0.75) {
    const ray = JEWEL_CUT.girdle * 0.55 * brightest.scale * Math.min(1, brightest.light);
    g.fillStyle = 'rgba(255, 255, 255, 0.95)';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const reach = i % 2 === 0 ? ray : ray * 0.16;
      g.lineTo(brightest.x + Math.cos((i * Math.PI) / 4) * reach, brightest.y + Math.sin((i * Math.PI) / 4) * reach);
    }
    g.closePath();
    g.fill();
  }
}

/** The corners of a jewel lamp on the front of the lower table, on the drawing. */
const lampOutline = (lamp: number): Projected[] => LAMP_OUTLINE.map(([across, up]) => project(jewelLampX(lamp) + across * JEWEL_LAMPS.radius, JEWEL_LAMPS.height + up * JEWEL_LAMPS.radius, D));

/**
 * The jewel lamps that are lit, on their plate in the front of the lower
 * table: each a cut stone seen from the side, rose, with its table and its
 * girdle picked out and a glow round it. The one lit last shines brighter for
 * a moment, and while a bonus is being shown all five are lit and flash.
 */
function drawJewelLamps(g: CanvasRenderingContext2D, stage: Stage, lit: number, calm: boolean, shift: number): void {
  const k = stage.ratio;
  g.setTransform(k, 0, 0, k, shift * k, 0);
  for (let lamp = 0; lamp < JEWEL_LAMPS.count; lamp++) {
    const light = lampLight(lamp, lit, stage.jewelShow, stage.clock, calm);
    if (light <= 0) continue;
    const fresh = lamp === lit - 1 && stage.jewelShow <= 0 ? stage.jewelGlow / GLOW_TIME : 0;
    const outline = lampOutline(lamp);
    const middle = project(jewelLampX(lamp), JEWEL_LAMPS.height, D);
    const reach = JEWEL_LAMPS.radius * middle.scale;
    g.fillStyle = `rgba(255, 86, 170, ${(0.3 + 0.3 * fresh) * light})`;
    g.beginPath();
    g.arc(middle.x, middle.y, reach * (1.5 + 0.5 * fresh), 0, TAU);
    g.fill();
    const rose = g.createLinearGradient(0, outline[0].y, 0, outline[3].y);
    rose.addColorStop(0, light > 0.7 ? '#ffe3f2' : '#ff9fd0');
    rose.addColorStop(0.35, light > 0.7 ? '#ff5aa8' : '#d81b78');
    rose.addColorStop(1, light > 0.7 ? '#c4125f' : '#7a0e44');
    g.fillStyle = rose;
    path(g, outline);
    g.fill();
    // Its cut: the girdle across it, and the edges of the faces down to the point.
    g.strokeStyle = 'rgba(255, 240, 248, 0.8)';
    g.lineWidth = 1;
    line(g, outline[4], outline[2]);
    const [left, right] = [project(jewelLampX(lamp) - JEWEL_LAMPS.radius * 0.35, JEWEL_LAMPS.height + JEWEL_LAMPS.radius * 0.3, D), project(jewelLampX(lamp) + JEWEL_LAMPS.radius * 0.35, JEWEL_LAMPS.height + JEWEL_LAMPS.radius * 0.3, D)];
    line(g, left, outline[3]);
    line(g, right, outline[3]);
    g.strokeStyle = '#fff3fa';
    g.lineWidth = 1.4;
    g.lineJoin = 'round';
    path(g, outline);
    g.stroke();
  }
}

/**
 * Tells the stage that a jewel has been collected: the lamp it lit shines for
 * a moment, sparks fly from it, and what it paid floats up from the plate. A
 * bonus lights all five lamps for its show, with more sparks and its name.
 */
export function showJewel(stage: Stage, lamp: number, medals: number, bonus: boolean): void {
  stage.jewelGlow = GLOW_TIME;
  if (bonus) stage.jewelShow = JEWEL_SHOW;
  const at = project(jewelLampX(Math.min(JEWEL_LAMPS.count - 1, Math.max(0, lamp))), JEWEL_LAMPS.height, D);
  for (let i = 0; i < (bonus ? 40 : 14); i++) {
    const angle = -Math.PI / 2 + (((i * 37 + lamp * 11) % 100) / 100 - 0.5) * (bonus ? 3 : 2.2);
    const speed = 60 + ((i * 29 + lamp * 7) % 90);
    addSpark(stage, { x: bonus ? VIEW.width / 2 + (((i * 53) % 100) / 100 - 0.5) * (JEWEL_PLATE.to - JEWEL_PLATE.from) * at.scale : at.x, y: at.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: bonus ? 1.1 : 0.7, size: 3, color: JEWEL_SPARKS[i % JEWEL_SPARKS.length] });
  }
  const top = project(FIELD.width / 2, JEWEL_PLATE.top, D);
  stage.popups.push({ x: top.x, y: top.y - 8, text: bonus ? `JEWEL BONUS +${medals}` : `JEWEL +${medals}`, age: 0, color: '#ffb7dc' });
}

// ── The catcher ─────────────────────────────────────────────────────────────

/** How tall the capitals of the words on the catcher's slide are, in field units down its slope. */
export const APRON_CAP = 3.5;
/** A heavy face for a word that has to be read from across the cabinet, narrow where the device has one that is. */
const SIGN_FACE = 'Impact, "Avenir Next Condensed", "Arial Narrow", "Arial Black", Arial, sans-serif';

/**
 * Writes a word with its middle at (x, y), its capitals `cap` tall and the
 * whole of it no more than `wide` across: it is measured as the device will
 * draw it, and squeezed sideways only as far as it has to be to fit.
 */
function word(g: CanvasRenderingContext2D, text: string, x: number, y: number, wide: number, cap: number, fill: string): void {
  g.font = `900 10px ${SIGN_FACE}`;
  const measured = g.measureText(text) as TextMetrics | undefined;
  // A canvas that cannot measure is taken to draw the letters as Arial Black does.
  const ascent = measured && measured.actualBoundingBoxAscent > 0 ? measured.actualBoundingBoxAscent : 7.16;
  const natural = measured && measured.width > 0 ? measured.width : 36.7;
  const tall = cap / ascent;
  g.save();
  g.translate(x, y + cap / 2);
  g.scale(Math.min(tall, wide / natural), tall);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineWidth = 1.5;
  g.strokeStyle = '#3d0420';
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

/**
 * The strip of the catcher's slide that has the words on it, flat: its plate
 * with a gold line along the top and the foot, and the word START under each
 * slot, as tall as the plate has room for. One unit of the canvas is one
 * field unit; the strip is `CATCHER.to − CATCHER.from` across and `APRON`
 * down. `lit` says how brightly each slot's stretch of it is lit, from 0 to
 * 1, the left slot's first. The 3D renderer leaves it out: it paints the
 * strip unlit, once, and lights a stretch by itself.
 */
export function paintApron(g: CanvasRenderingContext2D, lit?: readonly number[]): void {
  const wide = CATCHER.to - CATCHER.from;
  const plate = g.createLinearGradient(0, 0, 0, APRON);
  plate.addColorStop(0, '#ff4fa3');
  plate.addColorStop(0.5, '#d81b78');
  plate.addColorStop(1, '#6a0a3a');
  g.fillStyle = plate;
  g.fillRect(0, 0, wide, APRON);
  for (let i = 0; i < CHUCKERS.count; i++) {
    const shine = lit ? lit[i] : 0;
    if (shine > 0) {
      g.fillStyle = `rgba(255, 244, 150, ${0.75 * shine})`;
      g.fillRect(CATCHER.tile * i, 0, CATCHER.tile, APRON);
    }
    word(g, 'START', CATCHER.tile * (i + 0.5), APRON / 2, CATCHER.tile - 1.9, APRON_CAP, shine > 0 ? '#ffffff' : '#fff6c4');
  }
  g.fillStyle = '#ffd65c';
  g.fillRect(0, 0, wide, 0.22);
  g.fillRect(0, APRON - 0.22, wide, 0.22);
}

/** A medal that has come over the lip at the catcher and is on its way down: on a tongue, into a slot or into the well. Where it has got to. */
interface Sliding {
  medal: Medal;
  held: Caught;
}

/**
 * What of a START slot's shape the catcher (`START_SLOT` in catcher.ts) does
 * not say, which is here what it is in the 3D picture: how far in from the
 * edge of the opening the throat is, and how far under the slide the ring of
 * light inside the frame ends. The ring slopes in and down by this much.
 */
export const SLOT_SHAPE = { ring: { in: 0.4, down: 0.6 } } as const;
/**
 * The lights of a START slot: the gold of the frame of one that is lit, by
 * the lucky lamp or because the wings are open, and of its lamp; the brighter
 * gold of the ring of light inside a lit frame, and of the frame of a slot a
 * medal has just gone down; the bright brass of a frame that is neither; and
 * each slot's own colour, from the left, which its ring and its lamp have
 * while it waits.
 */
export const SLOT_LIGHT = { gold: '#ffe9a6', lamp: '#ffd65c', flash: '#fffbe0', idle: '#f0c85a', own: ['#7df0ff', '#ff9bd0', '#9dff8a'] } as const;
/**
 * The inside of a START slot, down its throat. One that waits is dark: the
 * top of its far wall catches the light of the ring above it, and that light
 * is gone by the floor, which is black. The gold of the lucky lamp fills the
 * mouth of the slot it is on: the far wall from its top to its foot, the
 * sides, and the floor from its far end to its near end, none of it dark.
 * These are the colours the 3D picture's throat has (`buildCatcher` in
 * cabinet3d.ts), as they come out on the screen.
 */
export const SLOT_THROAT = {
  far: ['#a58cf5', '#7866b3', '#3c335a', '#000000'],
  side: ['#3a1a86', '#000000'],
  floor: '#000000',
  gold: { far: ['#fff6cf', '#ffc23d'], side: ['#ffc23d', '#c98a14'], floor: ['#f0b030', '#c98a14'] },
} as const;
/**
 * The well under the lip, which is the inside of the catcher's box seen from
 * above: the pusher's face in the shade of its own lip, from the lip down to
 * where the slide's upper edge hides it. It is as dark as the 3D picture
 * has it, which is all but black, and darker the further down; and never
 * quite the black of a throat's floor, which has no blue in it at all, so
 * that a picture read back pixel by pixel tells the one from the other.
 */
export const WELL_SHADE = ['#0c0a1a', '#08061a'] as const;
/**
 * A tongue: the brass of its top, from its end at the lip to its end at the
 * slot, and of the side of its web; and the same of one whose slot is lit.
 */
export const TONGUE_BRASS = { top: ['#e8bd4a', '#fff0b8'], side: '#8a5a0c', lit: ['#ffe9a6', '#fffbe0'], litSide: '#b77d12' } as const;

/** Where a spot of the cabinet is on the drawing. */
const seen = (spot: Spot): Projected => project(spot.x, spot.height, spot.depth);

/**
 * A medal the catcher has, drawn where it has it and tipped as it has it.
 * One on a tongue, lying on it or hanging on its edge, is seen whole. One
 * that is going over the end of its tongue into its slot is seen whole as far
 * as it is still above the slide, and under the slide only down the slot's
 * opening. One that is going down into the well is seen as far as the well
 * shows it: above the upper edge of the slide, which hides the rest; and it
 * darkens as it goes, the well being dark.
 *
 * The catcher says where a medal's middle is. Its face is half its thickness
 * above that, the way the face looks, and its rim as far below.
 */
function stampSliding(g: CanvasRenderingContext2D, stage: Stage, { medal, held }: Sliding, time: number, wings: boolean, shift: number): void {
  const k = stage.ratio;
  g.setTransform(k, 0, 0, k, shift * k, 0);
  g.save();
  if (held.leg === 'slot') {
    const opening = slotCorners(held.chucker, time, wings, 0, CATCHER.rim.high).map(seen);
    g.beginPath();
    g.moveTo(opening[0].x, opening[0].y);
    for (const corner of opening.slice(1)) g.lineTo(corner.x, corner.y);
    g.closePath();
    g.rect(-VIEW.width, opening[0].y - VIEW.height, VIEW.width * 3, VIEW.height + 0.5);
    g.clip();
  } else if (held.leg === 'gap') {
    const edge = seen(slopeSpot(W / 2, CATCHER.gap, time));
    g.beginPath();
    g.rect(-VIEW.width, edge.y - VIEW.height, VIEW.width * 3, VIEW.height);
    g.clip();
  }
  // Tipped forward by `tilt` about the line across the field, or about `heading`: the way its face looks.
  const half = T / 2;
  const face: Spot = {
    x: held.x - Math.sin(held.heading) * Math.sin(held.tilt) * half,
    height: held.height + Math.cos(held.tilt) * half,
    depth: held.depth + Math.cos(held.heading) * Math.sin(held.tilt) * half,
  };
  stampHeld(g, stage, face, turnOf(medal.id), held.tilt, held.heading, shift, held.light, medal.id);
  g.restore();
}

/**
 * The catcher that rides on the front of the pusher, under its lip, drawn
 * from the back forward: the shadow it throws on the lower table and the dark
 * under it; the well under the lip, which is dark; its slide, the board that
 * leans from the well's edge down toward the player; for each START slot the
 * frame that stands up round its opening, and down the opening the throat —
 * the ring of light that slopes into it, the far wall, which catches that
 * light, and the dark floor — then the glow of a slot that is lit, its two
 * wings, its tongue, a bridge of brass from the lip over the well to the
 * opening, and the lamp at its lower end; and on the last of the slide,
 * under the slots, the strip with the word START under each.
 *
 * A slot is in its own colour while it waits, in a frame of bright brass,
 * and its throat is dark. The one the lucky lamp is on is gold, steadily:
 * its frame, its ring, its tongue, its lamp, which is a little bigger, and
 * the whole of its mouth, which the gold fills, far wall, sides and floor
 * (`SLOT_THROAT`), with the glow of it over the opening as well as round
 * it. With `wings` all three are, the openings and the tongues are wider,
 * and the wings, which otherwise lie along the sides of the frames, have
 * swung out like the cheeks of a funnel. A slot a medal has just dropped
 * through is brighter still, all the way down, with a burst of light out
 * over its frame, and its stretch of the strip is lit, for as long as
 * `stage.gateGlow` says. Everything that lies on the lower table under the
 * catcher has been drawn before it and is covered by it; the medals that are
 * on their way down it are drawn after it.
 */
function drawCatcher(g: CanvasRenderingContext2D, stage: Stage, machine: Machine, front: number, phase: number, calm: boolean, wings: boolean, shift: number): void {
  const k = stage.ratio;
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);
  const { time } = machine;
  const { from, to, deck, rim, foot, throat, gap } = CATCHER;
  const out = front + foot.out;
  /** Fills an outline with a colour. */
  const fill = (points: Projected[], style: string | CanvasGradient): void => {
    g.fillStyle = style;
    path(g, points);
    g.fill();
  };
  /** Adds an outline to the path that is being made. */
  const trace = (points: Projected[]): void => {
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.closePath();
  };
  /** Whether a wall at `x` that faces `toward` (−1 is to the left, 1 to the right) is turned to the player, who looks down the middle of the field. */
  const shows = (x: number, toward: number): boolean => (W / 2 - x) * toward > 0;
  flat();
  // Its shadow on the lower table, in front of its foot and beside its right end, and the dark under it.
  g.fillStyle = 'rgba(0, 4, 18, 0.34)';
  const reach = (x: number, height: number, depth: number): Projected => project(x + height * SUN.x, T * 2, depth + height * SUN.depth);
  path(g, [project(from + foot.height * SUN.x, T * 2, out - 1), project(to, T * 2, out - 1), project(to, T * 2, front), reach(to, deck, front), reach(to, foot.height, out), reach(from, foot.height, out)]);
  g.fill();
  fill(facing(from, to, foot.height, 0, out), 'rgba(0, 4, 18, 0.55)');

  // The well under the lip. What is seen down it is the pusher's face in the shade, and that is all: whatever has gone down it is under the catcher.
  const well = wellCorners(time).map(seen);
  const pit = g.createLinearGradient(0, well[0].y, 0, well[2].y);
  pit.addColorStop(0, WELL_SHADE[0]);
  pit.addColorStop(1, WELL_SHADE[1]);
  fill(well, pit);

  // The slide, from the well's edge down to its foot, and the bright edge it turns to the well.
  const board = [slopeSpot(from, gap, time), slopeSpot(to, gap, time), slopeSpot(to, SLOPE.long, time), slopeSpot(from, SLOPE.long, time)].map(seen);
  const steel = g.createLinearGradient(0, board[0].y, 0, board[2].y);
  steel.addColorStop(0, '#7f8aad');
  steel.addColorStop(1, '#dfe5f4');
  fill(board, steel);
  g.strokeStyle = 'rgba(244, 247, 253, 0.9)';
  g.lineWidth = 1.2;
  line(g, board[0], board[1]);

  const gold = litSlots(time, wings, calm);
  const { ring } = SLOT_SHAPE;
  CHECKERS.positions.forEach((x, index) => {
    const lit = stage.gateGlow[index] / GLOW_TIME;
    const golden = gold[index];
    const bright = golden || lit > 0;
    const own = SLOT_LIGHT.own[index % SLOT_LIGHT.own.length];
    const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(stage.clock * 3 + index * 2.1);
    const half = slotHalf(wings);
    const opening = slotCorners(index, time, wings, 0, rim.high).map(seen);
    const outer = slotCorners(index, time, wings, rim.wide, rim.high).map(seen);
    const base = slotCorners(index, time, wings, rim.wide).map(seen);

    // The frame, standing a little out of the slide: its two sides and its lower end, and its top round the opening.
    const side = bright ? '#b77d12' : '#96650f';
    fill([outer[0], outer[3], base[3], base[0]], side);
    fill([outer[1], outer[2], base[2], base[1]], side);
    fill([outer[3], outer[2], base[2], base[3]], side);
    g.fillStyle = lit > 0 ? SLOT_LIGHT.flash : golden ? SLOT_LIGHT.gold : SLOT_LIGHT.idle;
    g.beginPath();
    trace(outer);
    trace(opening);
    g.fill('evenodd');

    // Down the opening: the floor of the throat; its far wall, lit from above, and whichever of its sides is turned
    // to the player; and the ring of light that slopes down into it from the frame. A slot that waits is dark down
    // there. The lucky lamp's gold fills the mouth, floor and all, and a medal going down lights it brighter still.
    const inner = slotCorners(index, time, wings, -ring.in, -ring.down);
    const mouth = inner.map(seen);
    const floor = inner.map((corner) => project(corner.x, throat, corner.depth));
    /** A wash of colour down the throat: from the first colour at `from` on the drawing to the last at `to`, evenly. */
    const shade = (from: number, to: number, colours: readonly string[]): CanvasGradient => {
      const wash = g.createLinearGradient(0, from, 0, to);
      colours.forEach((colour, at) => wash.addColorStop(at / (colours.length - 1), colour));
      return wash;
    };
    /** The throat: its floor, its far wall and whichever of its sides shows, dark as in a slot that waits or filled with gold. */
    const throatOf = (filled: boolean): void => {
      fill(opening, filled ? shade(floor[0].y, floor[2].y, SLOT_THROAT.gold.floor) : SLOT_THROAT.floor);
      fill([mouth[0], mouth[1], floor[1], floor[0]], shade(mouth[0].y, floor[0].y, filled ? SLOT_THROAT.gold.far : SLOT_THROAT.far));
      const dim = shade(mouth[0].y, floor[0].y, filled ? SLOT_THROAT.gold.side : SLOT_THROAT.side);
      if (shows(x - half + ring.in, 1)) fill([mouth[0], mouth[3], floor[3], floor[0]], dim);
      if (shows(x + half - ring.in, -1)) fill([mouth[1], mouth[2], floor[2], floor[1]], dim);
    };
    g.save();
    path(g, opening);
    g.clip();
    throatOf(golden);
    // A medal that has just gone down a slot that waits fills it with gold too, which fades back to the dark; and it lights all of any slot, and that light fades.
    if (lit > 0) {
      if (!golden) {
        g.globalAlpha = lit;
        throatOf(true);
        g.globalAlpha = 1;
      }
      fill(opening, `rgba(255, 251, 224, ${0.55 * lit})`);
    }
    const neon = bright ? SLOT_LIGHT.flash : own;
    g.globalAlpha = bright ? 1 : 0.7 + 0.3 * pulse;
    fill([opening[0], opening[1], mouth[1], mouth[0]], neon);
    fill([opening[0], opening[3], mouth[3], mouth[0]], neon);
    fill([opening[1], opening[2], mouth[2], mouth[1]], neon);
    g.restore();

    // The light of it on what is round it: a slot that is lit gold glows, steadily, over its opening and round
    // it; and one a medal has just gone down bursts with light, out over its frame and the slide, and that fades.
    const glow = (wide: number, strength: number): void => {
      const o = seen(slopeSpot(x, CATCHER.back + START_SLOT.long / 2, time, rim.high));
      const u = seen(slopeSpot(x + 1, CATCHER.back + START_SLOT.long / 2, time, rim.high));
      const v = seen(slopeSpot(x, CATCHER.back + START_SLOT.long / 2 + 1, time, rim.high));
      g.setTransform((u.x - o.x) * k, (u.y - o.y) * k, (v.x - o.x) * k, (v.y - o.y) * k, (o.x + shift) * k, o.y * k);
      const halo = g.createRadialGradient(0, 0, 0, 0, 0, wide);
      halo.addColorStop(0, `rgba(255, 244, 150, ${strength})`);
      halo.addColorStop(1, 'rgba(255, 244, 150, 0)');
      g.fillStyle = halo;
      g.beginPath();
      g.arc(0, 0, wide, 0, TAU);
      g.fill();
      flat();
    };
    g.globalCompositeOperation = 'lighter';
    if (golden) glow((half + rim.wide) * 1.5, 0.3);
    if (lit > 0) glow((half + rim.wide) * (1.2 + BURST.reach * lit), 0.55 * lit);
    g.globalCompositeOperation = 'source-over';

    // Its two wings: low fences on the slide. Folded, each lies along the side of the frame. Open, during chance
    // time, each has swung out from the slot at its upper end, gold.
    for (const away of [-1, 1]) {
      const foot = wingCorners(index, away, time, wings).map(seen);
      const waist = wingCorners(index, away, time, wings, rim.high).map(seen);
      const top = wingCorners(index, away, time, wings, START_SLOT.wing.high).map(seen);
      const flank = wings ? '#d9a21f' : '#b07a16';
      // Of its two long faces, a folded one's face against the frame is seen above the frame only; the other, and both of an open one, down to the slide.
      const hinge = x + away * (half + rim.wide);
      if (shows(hinge, -away)) fill(wings ? [top[0], top[3], foot[3], foot[0]] : [top[0], top[3], waist[3], waist[0]], flank);
      if (shows(hinge + away * START_SLOT.wing.thick, away)) fill([top[1], top[2], foot[2], foot[1]], flank);
      fill([top[3], top[2], foot[2], foot[3]], flank);
      fill(top, wings ? '#fff3a8' : '#f6d877');
    }

    // Its tongue, over the well from the lip to the upper edge of the opening: the side of its web that is turned
    // to the player, and then its top, which is level with the top of the frame. It is gold while its slot is lit.
    const bridge = tongueCorners(index, time, wings).map(seen);
    const web = tongueCorners(index, time, wings, rim.high - TONGUE.deep).map(seen);
    const beam = tongueHalf(wings);
    const brass = bright ? TONGUE_BRASS.litSide : TONGUE_BRASS.side;
    if (shows(x - beam, -1)) fill([bridge[0], bridge[3], web[3], web[0]], brass);
    if (shows(x + beam, 1)) fill([bridge[1], bridge[2], web[2], web[1]], brass);
    const run = g.createLinearGradient(0, bridge[0].y, 0, bridge[2].y);
    const [far, near] = bright ? TONGUE_BRASS.lit : TONGUE_BRASS.top;
    run.addColorStop(0, far);
    run.addColorStop(1, near);
    fill(bridge, run);

    // The lamp on the lower bar of its frame: gold, and bigger, while the slot is lit; in the slot's own colour, glowing a little, while it waits.
    const lamp = seen(lampSpot(index, time));
    const r = START_SLOT.lamp.radius * (bright ? 1.25 : 1) * lamp.scale;
    g.fillStyle = '#2a1f5c';
    g.beginPath();
    g.arc(lamp.x, lamp.y, r, 0, TAU);
    g.fill();
    g.globalAlpha = bright ? 1 : 0.85 + 0.15 * Math.sin(phase + index * 2.1);
    g.fillStyle = bright ? SLOT_LIGHT.lamp : own;
    g.beginPath();
    g.arc(lamp.x, lamp.y, r, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    if (bright) {
      g.fillStyle = SLOT_LIGHT.flash;
      g.beginPath();
      g.arc(lamp.x - r * 0.25, lamp.y - r * 0.25, r * 0.45, 0, TAU);
      g.fill();
    }
  });

  // The strip with the words, on the last of the slide: its plate, then what is printed on it, laid on as a flat sheet on the slope.
  const span = to - from;
  const corners = [apronSpot(0, 0, time), apronSpot(span, 0, time), apronSpot(span, APRON, time), apronSpot(0, APRON, time)].map(seen);
  g.save();
  path(g, corners);
  g.clip();
  g.fillStyle = '#d81b78';
  g.fill();
  const o = seen(apronSpot(span / 2, 0, time));
  const u = seen(apronSpot(span / 2 + 1, 0, time));
  const v = seen(apronSpot(span / 2, 1, time));
  const ax = u.x - o.x;
  const ay = u.y - o.y;
  g.setTransform(ax * k, ay * k, (v.x - o.x) * k, (v.y - o.y) * k, (o.x - (span / 2) * ax + shift) * k, (o.y - (span / 2) * ay) * k);
  paintApron(
    g,
    stage.gateGlow.map((glow) => glow / GLOW_TIME),
  );
  // The light of a slot that is lit gold falls on its stretch of the strip too, a little.
  gold.forEach((golden, index) => {
    if (!golden) return;
    const wash = g.createLinearGradient(CATCHER.tile * index, 0, CATCHER.tile * (index + 1), 0);
    wash.addColorStop(0, 'rgba(255, 244, 150, 0)');
    wash.addColorStop(0.5, 'rgba(255, 244, 150, 0.22)');
    wash.addColorStop(1, 'rgba(255, 244, 150, 0)');
    g.fillStyle = wash;
    g.fillRect(CATCHER.tile * index, 0, CATCHER.tile, APRON);
  });
  g.restore();
  flat();
}

export interface DrawOptions {
  /** Whether to show, under each arm's tip, how far a medal let go there can land from it. */
  showGuide: boolean;
  /** Leave out the motion that only decorates: running lights, flashes and the shake. */
  calm?: boolean;
  /** How many spins the machine is holding, which is how many of the lamps under the screen are lit. */
  stock?: number;
  /** How many of those are gold, in chance time or out of it. Their lamps, the first so many from the left, flash. */
  gold?: number;
  /** Whether the START slots' wings are open, which they are during chance time: all three slots are lit gold and take medals more easily. */
  wings?: boolean;
  /** How many jewels have been collected since the jewel lamps last went out, which is how many of them are lit. */
  jewels?: number;
  /**
   * The light the screen throws into the cabinet: its colour, each part from 0 to 1, and how strong it is, 0 for
   * a dark screen and about 1 for one that is all white. Whatever lies on the pusher in front of the screen takes
   * it. Left out, the screen glows as an idle one does (`SCREEN_GLOW`). Only the 3D renderer has light to add it to.
   */
  glow?: Glow;
  /** Ask the 3D renderer for its plain picture, the one it also drops to by itself on a device that is slow. */
  plain?: boolean;
}

/** A light's colour, each part from 0 to 1, and how strong it is. */
export interface Glow {
  colour: readonly [number, number, number];
  level: number;
}

/** What the screen throws into the cabinet when nobody says otherwise: the blue-violet of its idle picture, not strong. */
export const SCREEN_GLOW: Glow = { colour: [0.55, 0.5, 1], level: 0.32 };

/** Draws one frame of the field. */
export function drawField(g: CanvasRenderingContext2D, stage: Stage, machine: Machine, options: DrawOptions): void {
  const k = stage.ratio;
  const calm = options.calm ?? false;
  const wings = options.wings ?? false;
  const front = pusherFront(machine.time);
  const party = stage.party;
  // A tower coming down shakes the cabinet for a moment.
  const shake = !calm && party?.kind === 'crash' ? Math.sin(stage.clock * 90) * 2.2 * (party.left / PARTY_TIME.crash) : 0;
  const flat = () => g.setTransform(k, 0, 0, k, shake * k, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  // The background replaces whatever the last frame left, the clear opening for the screen included.
  g.globalCompositeOperation = 'copy';
  g.drawImage(stage.background, shake * k, 0);
  g.globalCompositeOperation = 'source-over';
  flat();

  // Running lights down both sides of the screen, along the rails and under the front edge. The row across the hood comes later, with the hood.
  const partying = party !== null && party.kind !== 'crash';
  // The glow moves one bulb every second or so; a fever or a jackpot hurries it.
  const phase = calm ? 0 : stage.clock * (partying ? 7 : 1.6);
  const lights: readonly string[] = partying ? SPARK_COLORS : ['#fff3a8', '#ffd65c'];
  const strips: readonly string[] = partying ? SPARK_COLORS : ['#ff9bd0', '#7df0ff'];
  const beside = (SCREEN.left - 1.1) / 2;
  for (const x of [beside, W - beside]) {
    bulbs(g, project(x, HOUSING.hood - 3.2, HOUSING.ledge), project(x, SCREEN.foot + 3.2, HOUSING.ledge), 12, phase, strips, 2.4);
  }
  // The hold: a lamp for each spin the machine is holding, lit from the left.
  const held = options.stock ?? 0;
  const gold = Math.min(held, options.gold ?? 0);
  for (let i = 0; i < 8; i++) {
    const lamp = project(HOLD_LAMPS.first + HOLD_LAMPS.step * i, (HOUSING.shelf + SCREEN.foot) / 2, HOUSING.ledge);
    const r = HOLD_LAMPS.radius * lamp.scale;
    // A gold spin's lamp flashes by the stage's own clock, each a beat behind the one before it; with motion reduced it is steadily bright.
    const flash = i < gold ? goldFlash(stage.clock, i, calm) : 0;
    if (i < held) {
      g.fillStyle = i < gold ? `rgba(255, 244, 150, ${0.3 + 0.5 * flash})` : 'rgba(255, 214, 92, 0.3)';
      g.beginPath();
      g.arc(lamp.x, lamp.y, r * (2.2 + 1.4 * flash), 0, TAU);
      g.fill();
    }
    g.fillStyle = i < gold && flash > 0.5 ? '#fffbe0' : i < held ? '#ffd65c' : '#2a1f5c';
    g.beginPath();
    g.arc(lamp.x, lamp.y, r, 0, TAU);
    g.fill();
    g.fillStyle = i < held ? '#fffbe0' : '#4a3d8a';
    g.beginPath();
    g.arc(lamp.x - r * 0.25, lamp.y - r * 0.25, r * 0.45, 0, TAU);
    g.fill();
    // A lamp a spark has just reached is white hot for a moment, with a wide bloom round it, whether or not the spin it is for is still held.
    const reached = stage.holdGlow[i] / GLOW_TIME;
    if (reached > 0) {
      g.fillStyle = `rgba(255, 251, 224, ${0.5 * reached})`;
      g.beginPath();
      g.arc(lamp.x, lamp.y, r * (2.4 + 2.2 * reached), 0, TAU);
      g.fill();
      g.fillStyle = `rgba(255, 255, 255, ${reached})`;
      g.beginPath();
      g.arc(lamp.x, lamp.y, r * 1.15, 0, TAU);
      g.fill();
    }
  }
  bulbs(g, project(0, HEIGHT.sideWall + 2, 2), project(0, HEIGHT.sideWall + 2, OPEN - 2), 12, phase, lights, 2.2);
  bulbs(g, project(W, HEIGHT.sideWall + 2, 2), project(W, HEIGHT.sideWall + 2, OPEN - 2), 12, phase, lights, 2.2);

  // The arrows on the chutes beside the open sides glow one after another, away from the wall and toward the
  // player, which is the way a medal that is lost goes, and the arrows in the mouth round the corner after them,
  // from the side toward the tray. A hole a medal has just gone down is lit for a moment, the side's chute and the
  // mouth alike: it is one hole.
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const index of [0, 1]) {
    const side = index === 0 ? -1 : 1;
    for (let i = 0; i < CHUTE.marks.length + SIDE_HOLE.marks.length; i++) {
      const glow = calm ? 0.3 : 0.12 + 0.5 * Math.max(0, Math.sin(stage.clock * 3.2 - i * 1.3));
      g.strokeStyle = `rgba(255, 150, 160, ${glow})`;
      g.lineWidth = i < CHUTE.marks.length ? 7 : 6;
      if (i < CHUTE.marks.length) chuteArrow(g, side, CHUTE.marks[i]);
      else mouthArrow(g, side, SIDE_HOLE.marks[i - CHUTE.marks.length]);
    }
    if (stage.sideGlow[index] <= 0) continue;
    g.fillStyle = `rgba(255, 70, 96, ${0.45 * (stage.sideGlow[index] / GLOW_TIME)})`;
    path(g, chutePatch(side));
    g.fill();
    path(g, mouthPatch(side));
    g.fill();
  }
  if (stage.trayGlow > 0) {
    g.fillStyle = `rgba(255, 214, 92, ${0.4 * (stage.trayGlow / GLOW_TIME)})`;
    path(g, [project(TRAY.from, 0, D), project(TRAY.to, 0, D), project(TRAY.to, -18, D), project(TRAY.from, -18, D)]);
    g.fill();
  }
  bulbs(g, project(TRAY.from + 1.3, -3, D), project(TRAY.to - 1.3, -3, D), TRAY_BULBS, phase, ['#ffd65c', '#fff3a8'], 2.4);

  // The pusher is a box of clear acrylic. Its front face, lighter toward the bright edge of the sheet on top of it, and the shadow it throws on the lower table.
  const face = [project(0, 0, front), project(W, 0, front), project(W, P, front), project(0, P, front)];
  const shadow = g.createLinearGradient(0, face[0].y, 0, project(0, 0, front + 8).y);
  shadow.addColorStop(0, 'rgba(0, 6, 20, 0.66)');
  shadow.addColorStop(1, 'rgba(0, 6, 20, 0)');
  g.fillStyle = shadow;
  path(g, [face[0], face[1], project(W, 0, front + 8), project(0, 0, front + 8)]);
  g.fill();
  const faceShade = g.createLinearGradient(0, face[2].y, 0, face[0].y);
  faceShade.addColorStop(0, '#bdeeff');
  faceShade.addColorStop(0.14, '#5fb6da');
  faceShade.addColorStop(0.55, '#1f5e88');
  faceShade.addColorStop(1, '#0c2f4c');
  g.fillStyle = faceShade;
  path(g, face);
  g.fill();
  // The face's bulbs are to either side of the catcher, which has the middle of it.
  bulbs(g, project(3, P / 2, front), project(CATCHER.from - 2, P / 2, front), 12, phase, ['#7df0ff', '#d6fbff'], 2.2);
  bulbs(g, project(CATCHER.to + 2, P / 2, front), project(W - 3, P / 2, front), 12, phase, ['#7df0ff', '#d6fbff'], 2.2);

  // The lower table's medals come before the catcher, which hangs over the ones at the foot of the pusher's face and
  // covers them. A ball whose middle has come out from under its foot is taller than it and stands before it, so it
  // comes after. Whatever has just come over the lip at the catcher is on its way down it, above everything it
  // passes, and is drawn last of all the medals: a medal on its tongue, going into its slot or going down into the
  // well, and a ball rolling down the slide. Once a medal is down it is under the catcher, where the engine has it,
  // and is drawn with the lower table's own, which the catcher covers. A ball that has come down in front of the
  // foot stands there, where the catcher has it, until the engine has it there too. A jewel is lower than the
  // catcher and lies under it like a medal. Every list is drawn from the back forward, so that of two things that
  // overlap, the nearer is the one seen.
  const lower: Medal[] = [];
  const upper: Medal[] = [];
  const sliding: Sliding[] = [];
  const clear: Medal[] = [];
  const going: { ball: Medal; at: Spot }[] = [];
  for (const medal of machine.medals) {
    if (medal.level === 1) {
      upper.push(medal);
      continue;
    }
    const held = caught(medal, machine.time, calm, wings);
    const rolled = held ? null : rolling(medal, BALL_RADIUS, machine.time);
    if (held) sliding.push({ medal, held });
    else if (rolled && rolled.leg !== 'table') going.push({ ball: medal, at: rolled });
    else {
      // Where it lies: where the catcher has it, if it is a ball the catcher has standing on the lower table, and where the engine has it if not.
      const lain = rolled ? { ...medal, x: rolled.x, y: rolled.depth, sinceDrop: -1 } : medal;
      if (lain.ball && lain.y >= front + CATCHER.foot.out && underCatcher(lain.x, lain.y, BALL_RADIUS * 2, machine.time)) clear.push(lain);
      else lower.push(lain);
    }
  }
  lower.sort(byDepth);
  upper.sort(byDepth);
  clear.sort(byDepth);
  // Two balls as far down the slide as each other are told apart by where the machine has them.
  going.sort((a, b) => a.at.depth - b.at.depth || byDepth(a.ball, b.ball));
  /** The jewels among some medals, each drawn where it lies: after the medals of its table, as a ball is. */
  const jewelsOf = (medals: readonly Medal[]) => {
    for (const medal of medals) if (medal.jewel) drawJewel(g, stage, lyingJewel(medal, machine.time), medal.level === 1 || medal.sinceDrop < 0 || medal.sinceDrop >= LIP_FALL, calm, shake);
  };
  drawMedals(g, stage, lower, 0, shake);
  jewelsOf(lower);
  drawCatcher(g, stage, machine, front, phase, calm, wings, shake);
  drawMedals(g, stage, clear, 0, shake);

  // The pusher's top: through it, the dark inside the box and the ribs that brace it, which travel with it; along its lip, chevrons and the bright edge of the sheet.
  flat();
  const top = [project(0, P, 0), project(W, P, 0), project(W, P, front), project(0, P, front)];
  const topShade = g.createLinearGradient(0, top[0].y, 0, top[2].y);
  topShade.addColorStop(0, '#12466f');
  topShade.addColorStop(0.7, '#2d86b4');
  topShade.addColorStop(1, '#5ec4e6');
  g.fillStyle = topShade;
  path(g, top);
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(214, 248, 255, 0.4)';
  for (let back = 9; front - back > 0; back += 9) line(g, project(0, P, front - back), project(W, P, front - back));
  g.strokeStyle = 'rgba(214, 248, 255, 0.22)';
  for (let x = 12.5; x < W; x += 12.5) line(g, project(x, P, 0), project(x, P, front));
  g.fillStyle = 'rgba(255, 196, 40, 0.6)';
  for (let x = 4; x < W; x += 8) {
    path(g, [project(x, P, front - 0.9), project(x + 4, P, front - 0.9), project(x + 2, P, front - 3.2), project(x - 2, P, front - 3.2)]);
    g.fill();
  }
  g.strokeStyle = 'rgba(236, 252, 255, 0.95)';
  g.lineWidth = 2.5;
  line(g, top[3], top[2]);
  // The tower lifts' hatches are in the deck, under whatever lies on it (works2d.ts).
  drawHatches(g, k, machine, front, calm, shake);
  // A tower that a lift still holds is not standing on the deck yet: the lift draws it, as far up through its hatch as it has come.
  drawMedals(g, stage, offLifts(machine, upper), P, shake);
  jewelsOf(upper);
  // The lifts that are bringing towers up through the deck, each with its tower and its guard (works2d.ts).
  drawLifts(
    g,
    k,
    machine,
    front,
    calm,
    shake,
    (tower) => drawTower(g, stage, tower, P, shake),
    (point, id) => stamp(g, stage, point, point.tilt, turnOf(id), shake),
  );
  // What has just come over the lip at the catcher is drawn where the catcher has it, not lying where the engine has
  // already put it: the medals on their way down it, the nearest to the lip first, and a ball rolling down its
  // slide. A jewel fits no slot and goes down into the well as a medal that fits none does.
  sliding.sort((a, b) => a.held.depth - b.held.depth || byDepth(a.medal, b.medal));
  for (const slid of sliding) {
    if (slid.medal.jewel) drawJewel(g, stage, lyingJewel(slid.medal, machine.time), false, calm, shake);
    else stampSliding(g, stage, slid, machine.time, wings, shake);
  }
  for (const { at } of going) drawBall(g, stage, at.x, at.height - BALL_RADIUS, at.depth, false, shake);
  flat();

  // Where a medal that leaves each arm now is let go, and how far from that it can land: from the
  // arm's tip, which is over its aim once it has swung there, down to the pusher. One guide for each arm.
  if (options.showGuide) {
    const lands = (LANDING.from + LANDING.to) / 2;
    for (const over of machine.tips) {
      const tip = project(over, ARMS.tip - R, ARMS.depth);
      const left = project(Math.max(R, over - LANDING.scatter), P, lands);
      const right = project(Math.min(W - R, over + LANDING.scatter), P, lands);
      const spread = g.createLinearGradient(0, tip.y, 0, left.y);
      spread.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
      spread.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
      g.fillStyle = spread;
      path(g, [tip, right, left]);
      g.fill();
    }
  }

  // The feed arms. First the shadows their rails lay on the tables, then each rail with the medals on it,
  // then the slots, which are nearest the player. An arm glows, and is lit in full while a medal is on its rail.
  // The shadows are the ones the rails lay on the two tables. Where the catcher is in the way they would lie on
  // it instead, somewhere else, so they are left off it.
  g.save();
  g.beginPath();
  g.rect(-VIEW.width, 0, VIEW.width * 3, VIEW.height);
  const footOut = front + CATCHER.foot.out;
  for (const [x, height, depth] of [
    [CATCHER.from, CATCHER.deck, front],
    [CATCHER.to, CATCHER.deck, front],
    [CATCHER.to, CATCHER.foot.height, footOut],
    [CATCHER.from, CATCHER.foot.height, footOut],
  ]) {
    const corner = project(x, height, depth);
    if (depth === front && x === CATCHER.from) g.moveTo(corner.x, corner.y);
    else g.lineTo(corner.x, corner.y);
  }
  g.closePath();
  g.clip('evenodd');
  g.strokeStyle = 'rgba(0, 4, 18, 0.32)';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const arm of [0, 1] as const) railShadow(g, machine, arm, front);
  g.restore();
  for (const arm of [0, 1] as const) {
    const busy = machine.rolling.some((medal) => medal.arm === arm);
    drawArm(g, stage, machine, arm, busy ? 1 : REST_LIGHT, shake);
  }
  for (const arm of [0, 1] as const) drawSlot(g, stage, machine, arm, shake);
  flat();

  // What the machine lets go comes down in front of the screen and is seen against it: first its shadow on the glass.
  g.save();
  path(g, glass());
  g.clip();
  for (const medal of machine.falling) {
    if (medal.source !== 'payout') continue;
    const at = airSpot(medal, medal.ball ? P + BALL_RADIUS : P + T * 2 + RIDE * 0.5);
    const on = project(at.x + CAST.x * at.depth, at.height + CAST.y * at.depth, 0);
    const size = (medal.ball ? BALL_RADIUS : R) * (1.2 + 0.05 * at.depth) * on.scale;
    g.fillStyle = `rgba(0, 0, 0, ${Math.max(0.12, (medal.ball ? 0.4 : 0.3) - 0.012 * at.depth)})`;
    g.beginPath();
    g.ellipse(on.x, on.y, size, size * UPRIGHT, 0, 0, TAU);
    g.fill();
  }
  g.restore();

  // Medals in the air: off an arm's tip, out of the slot under the hood, or off a tower that is going over.
  // One the hopper pours is drawn with its doors, further down.
  for (const medal of machine.falling) {
    if (medal.ball || medal.jewel || medal.source === 'pour') continue;
    const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
    if (medal.source === 'spill') {
      const from = P + T * (medal.rank + 1);
      const point = project(medal.fromX + (medal.x - medal.fromX) * t, T + (from - T) * (1 - t * t), medal.fromY + (medal.y - medal.fromY) * t);
      stamp(g, stage, point, point.tilt * (0.4 + 0.6 * Math.abs(Math.cos(t * 9 + medal.id))), turnOf(medal.id) + t * 5, shake, 1, medal.id);
      continue;
    }
    // It is drawn where it will lie once it is down, on top of the pile.
    const at = airSpot(medal, P + T * 2 + RIDE * 0.5);
    if (medal.source === 'player') {
      // Off an arm it leaves held as it rolled, leaning on its edge, and falls over onto its back on the way down.
      const held = leftHeld(medal, stage.fed.get(medal.id));
      stampHeld(g, stage, at, turnOf(medal.id), held.tilt * (1 - smooth(t)), held.heading, shake);
      continue;
    }
    // Out of the slot it falls faster and faster, turning over as it comes, and lands flat.
    const point = project(at.x, at.height, at.depth);
    const flip = Math.abs(Math.cos(t * Math.PI * 2.5 + Math.PI / 2 + (1 - t) * 0.6));
    const landing = smooth(Math.max(0, (t - 0.8) / 0.2));
    stamp(g, stage, point, (0.14 + 0.78 * flip) * (1 - landing) + point.tilt * landing, turnOf(medal.id), shake, 1, medal.id);
  }

  // The hood is in front of whatever is still inside it: a medal on its way out of the slot, a ball in the hatch.
  // So it is laid over them again, and then its own lights, which are on its face.
  const band = Math.ceil(project(0, HOUSING.hood, HOUSING.out).y * k);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(stage.background, 0, 0, stage.background.width, band, shake * k, 0, stage.background.width, band);
  flat();
  const across = (HOUSING.hood + HEIGHT.top) / 2 + 1.6;
  const reach = HATCH.x - HATCH.radius - 5;
  bulbs(g, project(3, across, HOUSING.out), project(reach, across, HOUSING.out), 10, phase, lights, 2.8);
  bulbs(g, project(W - reach, across, HOUSING.out), project(W - 3, across, HOUSING.out), 10, phase, lights, 2.8);
  // The door of the hatch stands open for a moment behind a prize ball.
  const open = machine.falling.some((ball) => (ball.ball || ball.jewel) && ball.remaining > ball.duration * 0.35);
  const hatch = project(HATCH.x, HATCH.height, HOUSING.out);
  const door = HATCH.radius * 0.84 * hatch.scale;
  const glaze = g.createRadialGradient(hatch.x - door * 0.3, hatch.y - door * 0.3, door * 0.1, hatch.x, hatch.y, door);
  glaze.addColorStop(0, open ? '#3a0a24' : '#ffb3d0');
  glaze.addColorStop(0.5, open ? '#1c0312' : '#ff5aa2');
  glaze.addColorStop(1, open ? '#000000' : '#7a0034');
  g.fillStyle = glaze;
  g.beginPath();
  g.ellipse(hatch.x, hatch.y, door, door * UPRIGHT, 0, 0, TAU);
  g.fill();
  for (const ball of machine.falling) {
    if (!ball.ball) continue;
    const at = airSpot(ball, P + BALL_RADIUS);
    drawBall(g, stage, at.x, at.height - BALL_RADIUS, at.depth, false, shake);
  }
  // A jewel comes out of the hatch as a ball does, tumbling.
  for (const jewel of machine.falling) if (jewel.jewel) drawJewel(g, stage, fallingJewel(jewel), false, calm, shake);
  flat();
  drawJewelLamps(g, stage, options.jewels ?? 0, calm, shake);
  flat();
  // The hopper's doors in the hood's face, and the medals pouring out of them (works2d.ts).
  drawHopper(g, k, machine, calm, shake, P + T * 2 + RIDE * 0.5, (point, round, id) => stamp(g, stage, point, round, turnOf(id), shake, 1, id));

  // Whatever has just left the field: it goes on the way it was pushed, tips over the edge and falls.
  for (const exit of stage.exits) {
    const a = exit.age;
    const won = exit.kind === 'won';
    const fall = (EXIT.gravity * a * a) / 2;
    const x = exit.x + (won ? 0 : exit.side * EXIT.sideways * a);
    const depth = exit.y + (won ? EXIT.forward * a : 0);
    // Over the front it drops out of sight below the edge of the glass; into a side pit it is lost in the dark.
    g.globalAlpha = won ? 1 : Math.max(0, 1 - (a / (EXIT_TIME * 0.7)) ** 2);
    if (exit.corner) {
      // Over the front edge at a side hole's mouth. A ball or a jewel crosses it on the bars, which are laid first:
      // it comes after them. A medal tips over the edge and drops into the mouth, on to the chute, and is gone down it.
      if (exit.ball || exit.jewel) continue;
      const sunk = sinking(exit.x, exit.y, exit.side, a, T);
      const point = project(sunk.x, sunk.height + T / 2, sunk.depth);
      // Its nose goes down toward the player, who looks down on it: the further it tips, the more of its face is seen.
      stamp(g, stage, point, Math.abs(Math.sin(Math.asin(point.tilt) + sunk.tilt)), turnOf(exit.id), shake, 1, exit.id);
      continue;
    }
    if (exit.ball) {
      drawBall(g, stage, x, -fall, depth, false, shake);
      continue;
    }
    if (exit.jewel) {
      drawJewel(g, stage, collectedJewel(exit.id, exit.x, exit.y, a), false, calm, shake);
      continue;
    }
    // One that went off a side comes down on the chute there and slides down it.
    const slide = won ? -Infinity : chuteHeight(Math.max(0, exit.side < 0 ? -x : x - W)) + T;
    const point = project(x, Math.max(T - fall, slide), depth);
    const turn = Math.min(won ? Math.PI : CHUTE_LEAN, a * EXIT.turn);
    stamp(g, stage, point, Math.max(0.12, point.tilt * Math.abs(Math.cos(turn))), turnOf(exit.id), shake, 1, exit.id);
  }
  g.globalAlpha = 1;
  // The ball rails across the mouths, over whatever has gone down them; and on the rails, a ball or a jewel that went
  // over at a corner, rolling along them to the tray.
  flat();
  for (const side of [-1, 1]) layRails(g, side);
  for (const exit of stage.exits) {
    if (!exit.corner || !(exit.ball || exit.jewel)) continue;
    if (exit.ball) {
      const at = railed(exit.x, exit.y, exit.side, exit.age, BALL_RADIUS, calm);
      drawBall(g, stage, at.x, at.height - BALL_RADIUS, at.depth, false, shake);
    } else {
      drawJewel(g, stage, railedJewel(exit, calm), false, calm, shake);
    }
  }
  flat();
  // The light falls off across the field: strongest where the pusher meets the lower table, under the roof's
  // lamps, and dim toward the side walls and the front corners. One shade over everything that has been drawn.
  flat();
  const middle = project(W / 2, 0, POOL.depth);
  const pool = g.createRadialGradient(middle.x, middle.y, VIEW.width * POOL.from, middle.x, middle.y, VIEW.width * POOL.to);
  pool.addColorStop(0, 'rgba(6, 3, 16, 0)');
  pool.addColorStop(1, `rgba(6, 3, 16, ${POOL.dark})`);
  g.fillStyle = pool;
  g.fillRect(0, project(0, HEIGHT.pusher, 0).y, VIEW.width, VIEW.height);
  drawOverlay(g, stage, calm);
}

/** Where the roof's light is strongest on the field, how far from there it stays full and where it is at its dimmest, in widths of the drawing, and how dim that is. */
export const POOL = { depth: 44, from: 0.22, to: 0.74, dark: 0.36 } as const;

/**
 * The glass at the front of the cabinet. What shows of a pane of glass is
 * what is on it and what it mirrors: here a soft band of the room's light
 * and a thin bright one beside it, slanting across; a haze of dust and
 * finger marks toward its edges, where nobody wipes; and along the top edge
 * the line of light a pane catches from the lamps over it.
 */
export const GLASS = { drift: 22, period: 46, bands: [0.24, 0.36], dust: 0.085, line: 0.3 } as const;

/**
 * How far the bands on the glass have drifted at `clock`, in pixels of the
 * drawing: there and back in `GLASS.period` seconds, as they do when the
 * player's head moves a little. Not at all in a calm cabinet.
 */
export function glassShift(clock: number, calm = false): number {
  return calm ? 0 : GLASS.drift * Math.sin((clock * TAU) / GLASS.period);
}

/**
 * What lies flat on the glass rather than in the cabinet: sparks, confetti,
 * the counts floating up from the tray, the wash of a fever and the glass
 * itself. It closes every frame of this renderer, and it is all the 3D
 * renderer draws on the canvas it keeps over its own. `wash` is how much of
 * the fever's colour goes on: all of it here, less over the 3D scene, whose
 * brighter gold a full wash turns pale.
 */
export function drawOverlay(g: CanvasRenderingContext2D, stage: Stage, calm = false, wash = 1): void {
  const k = stage.ratio;
  const partying = stage.party !== null && stage.party.kind !== 'crash';
  g.setTransform(k, 0, 0, k, 0, 0);

  // Sparks and confetti, then the counts floating up from the tray.
  for (const spark of stage.sparks) {
    g.globalAlpha = Math.max(0, 1 - spark.age / spark.life);
    g.fillStyle = spark.color;
    g.fillRect(spark.x - spark.size / 2, spark.y - spark.size / 2, spark.size, spark.size * (spark.life > 1 ? 1.8 : 1));
  }
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = '900 26px "Arial Black", Arial, sans-serif';
  g.lineJoin = 'round';
  for (const popup of stage.popups) {
    if (popup.word) continue;
    g.globalAlpha = Math.max(0, 1 - popup.age ** 2);
    const y = popup.y - popup.age * 46;
    g.lineWidth = 5;
    g.strokeStyle = popup.color ? '#3d0420' : '#3a2400';
    g.strokeText(popup.text, popup.x, y);
    g.fillStyle = popup.color ?? '#ffe98a';
    g.fillText(popup.text, popup.x, y);
  }
  // The words over the START slots. One pops up, a little too big at first, stands, and is gone; where nothing may move it only stands and is gone.
  for (const popup of stage.popups) {
    if (!popup.word) continue;
    const { size, still } = popup.word;
    const through = popup.age / BURST.word;
    const pop = still ? 1 : popup.age < 0.08 ? 0.6 + 7.5 * popup.age : popup.age < 0.18 ? 1.2 - 2 * (popup.age - 0.08) : 1;
    g.globalAlpha = Math.max(0, Math.min(1, (1 - through) / 0.3));
    g.font = `900 ${size * pop}px "Arial Black", Arial, sans-serif`;
    const y = popup.y - (still ? 0 : 16 * through);
    g.lineWidth = size * 0.2;
    g.strokeStyle = '#2a0f3a';
    g.strokeText(popup.text, popup.x, y);
    g.fillStyle = popup.color ?? ENTRY_INK.start;
    g.fillText(popup.text, popup.x, y);
  }
  g.globalAlpha = 1;
  // The sparks on their way from a START slot up to the hold's lamps: each a bright head with a tail behind it, gold and bigger for a gold spin.
  for (const entry of stage.entries) {
    if (entry.run < 0) continue;
    const lamp = project(HOLD_LAMPS.first + HOLD_LAMPS.step * lampFor(stage, entry), (HOUSING.shelf + SCREEN.foot) / 2, HOUSING.ledge);
    const gold = goldEntry(entry);
    const along = (share: number): { x: number; y: number } => {
      const eased = share * share * (3 - 2 * share);
      return { x: entry.from.x + (lamp.x - entry.from.x) * eased, y: entry.from.y + (lamp.y - entry.from.y) * eased };
    };
    const share = Math.min(1, entry.run / BURST.run);
    const head = along(share);
    const tail = along(Math.max(0, share - 0.3));
    const ink = gold ? ENTRY_INK.gold : ENTRY_INK.start;
    g.lineCap = 'round';
    g.strokeStyle = ink;
    for (const [alpha, width] of [
      [0.25, gold ? 11 : 8],
      [0.9, gold ? 4.5 : 3],
    ]) {
      g.globalAlpha = alpha;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(tail.x, tail.y);
      g.lineTo(head.x, head.y);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(head.x, head.y, gold ? 5.5 : 4, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;

  // A fever or a jackpot washes the cabinet with colour.
  if (!calm && partying) {
    const hue = (stage.clock * 160) % 360;
    g.fillStyle = `hsla(${hue}, 100%, 60%, ${(0.07 + 0.05 * Math.sin(stage.clock * 12)) * wash})`;
    g.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  // The glass in front of it all. Two bands of the room's light slant across it, a broad soft one and a thin
  // one beside it, and drift a little unless the cabinet is calm.
  const shift = glassShift(stage.clock, calm);
  const glass = g.createLinearGradient(shift, 0, VIEW.width + shift, VIEW.height * 0.9);
  const [broad, thin] = GLASS.bands;
  glass.addColorStop(broad - 0.08, 'rgba(236, 244, 255, 0)');
  glass.addColorStop(broad, 'rgba(236, 244, 255, 0.075)');
  glass.addColorStop(broad + 0.07, 'rgba(236, 244, 255, 0)');
  glass.addColorStop(thin - 0.012, 'rgba(255, 255, 255, 0)');
  glass.addColorStop(thin, 'rgba(255, 255, 255, 0.06)');
  glass.addColorStop(thin + 0.012, 'rgba(255, 255, 255, 0)');
  g.fillStyle = glass;
  g.fillRect(0, 0, VIEW.width, VIEW.height);
  // Dust and finger marks toward the edges, which lift the dark there a little: a pane is never clean to its frame.
  const dust = g.createRadialGradient(VIEW.width / 2, VIEW.height * 0.52, VIEW.width * 0.42, VIEW.width / 2, VIEW.height * 0.52, VIEW.height * 0.72);
  dust.addColorStop(0, 'rgba(196, 190, 204, 0)');
  dust.addColorStop(1, `rgba(196, 190, 204, ${GLASS.dust})`);
  g.fillStyle = dust;
  g.fillRect(0, 0, VIEW.width, VIEW.height);
  // The line of light along the top edge of the pane.
  const edge = g.createLinearGradient(0, 0, VIEW.width, 0);
  edge.addColorStop(0.04, 'rgba(255, 250, 236, 0)');
  edge.addColorStop(0.3, `rgba(255, 250, 236, ${GLASS.line})`);
  edge.addColorStop(0.62, 'rgba(255, 250, 236, 0.06)');
  edge.addColorStop(0.96, 'rgba(255, 250, 236, 0)');
  g.fillStyle = edge;
  g.fillRect(0, 1.5, VIEW.width, 1.2);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
