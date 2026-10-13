/**
 * Draws the cabinet on a canvas: the housing round the screen in the back
 * wall, the pusher that comes out from under it with the catcher for the
 * START pockets hung on its front, the two tables of medals, the two feed
 * arms with a slot at the near end of each, the open sides and the tray at
 * the front, and over them the lights, sparks and glass of an arcade cabinet.
 * Nothing here decides anything — it only shows the machine the engine is
 * running.
 *
 * The screen itself is not drawn. It is the page's own, stood behind the
 * canvas exactly where the opening in the housing is, and the picture is
 * left clear there but for what is in front of the screen.
 */

import { ARMS, HATCH, SLOT, airSpot, armCollar, fedSpot, leftHeld, railFrame, slotSpot, type Spot } from './arms';
import { APRON, CATCHER, apronSpot, caught, mouthSpots, underCatcher } from './catcher';
import { CHUCKERS } from './chuckers';
import { CHECKERS, FIELD, LANDING, MEDAL_RADIUS, PUSHER, SETTLE, pusherFront, type Arm, type Machine, type Medal } from './engine';
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

/** A count that floats up from the tray: the medals just won, or what a jewel has just paid, in its own colour. */
interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
  color?: string;
}

export interface Stage {
  /** Canvas pixels per pixel of the drawing. */
  ratio: number;
  /** Whether the three layers below have been drawn. The 3D renderer does without them until the canvas one has to take over. */
  painted: boolean;
  background: HTMLCanvasElement;
  medal: HTMLCanvasElement;
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

/** The chute beside an open side of the table, as far out as it is drawn: from where the wall ends to a little past the front. */
const chutePatch = (side: number): Projected[] => {
  const x = side < 0 ? 0 : W;
  const out = x + side * CHUTE_OUT;
  return [project(x, chuteHeight(0), OPEN), project(x, chuteHeight(0), D + 4), project(out, chuteHeight(CHUTE_OUT), D + 4), project(out, chuteHeight(CHUTE_OUT), OPEN)];
};

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

  // The lower table: a mirror-blue plate with lanes, an emblem and the words the player needs.
  const floor = [project(0, 0, 0), project(W, 0, 0), project(W, 0, D), project(0, 0, D)];
  const floorShade = g.createLinearGradient(0, floor[0].y, 0, floor[2].y);
  floorShade.addColorStop(0, '#061a33');
  floorShade.addColorStop(0.5, '#0b3764');
  floorShade.addColorStop(1, '#1668a6');
  g.fillStyle = floorShade;
  path(g, floor);
  g.fill();
  g.strokeStyle = 'rgba(160, 215, 255, 0.09)';
  g.lineWidth = 1.5;
  for (let x = 10; x < W; x += 10) line(g, project(x, 0, PUSHER.min), project(x, 0, D));
  onTable(g, ratio, W / 2, 70);
  g.strokeStyle = 'rgba(150, 215, 255, 0.16)';
  g.lineWidth = 0.9;
  for (const radius of [20, 15.5]) {
    g.beginPath();
    g.arc(0, 0, radius, 0, TAU);
    g.stroke();
  }
  starPath(g, 0, 0, 13, 5.4);
  g.fillStyle = 'rgba(150, 215, 255, 0.12)';
  g.fill();
  g.font = '900 6.5px "Arial Black", Arial, sans-serif';
  g.fillStyle = 'rgba(255, 226, 120, 0.42)';
  for (const x of [20, 50, 80]) {
    onTable(g, ratio, x, 93.5);
    g.fillText('GET', 0, 0);
  }
  g.fillStyle = 'rgba(255, 130, 150, 0.5)';
  g.font = '900 4.6px "Arial Black", Arial, sans-serif';
  for (const x of [7.5, W - 7.5]) {
    onTable(g, ratio, x, 84);
    g.fillText('OUT', 0, 0);
  }
  flat();
  const sheen = g.createLinearGradient(0, project(0, 0, 55).y, 0, floor[2].y);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(1, 'rgba(190, 230, 255, 0.14)');
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

  // The front of the table and the tray the winnings fall into.
  const lip = [project(0, 0, D), project(W, 0, D), project(W, -18, D), project(0, -18, D)];
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
    if (x + 3.2 > JEWEL_PLATE.from && x - 3.2 < JEWEL_PLATE.to) continue;
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
    medal: blank ?? medalSprite(),
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
  stage.medal = medalSprite();
  stage.ball = ballSprite();
  stage.painted = true;
}

/** Lights the START pocket a medal has just dropped through. */
export function lightGate(stage: Stage, gate: number): void {
  if (gate >= 0 && gate < stage.gateGlow.length) stage.gateGlow[gate] = GLOW_TIME;
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

/**
 * Notes which medals have left the field since the last frame and starts each
 * one falling: over the front into the tray, or off an open side. `won` is the
 * count the session just credited, which floats up from the tray.
 */
export function trackMedals(stage: Stage, machine: Machine, won = 0): void {
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
  for (const [id, last] of stage.seen) {
    // A tower that is gone went over the lip, and its medals are already in the air.
    if (last.tower) continue;
    const toFront = D - last.y;
    const toSide = Math.min(last.x, W - last.x);
    const isWon = last.ball || last.jewel || toFront <= toSide;
    const side = last.x < W / 2 ? -1 : 1;
    stage.exits.push({ id, x: last.x, y: last.y, kind: isWon ? 'won' : 'lost', side, ball: last.ball, ...(last.jewel ? { jewel: true } : {}), age: 0 });
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
  stage.tally += won;
}

/** Ages the lights, the sparks and whatever is on its way out. `calm` leaves the confetti out. */
export function ageStage(stage: Stage, dt: number, calm = false): void {
  stage.clock += dt;
  for (const exit of stage.exits) exit.age += dt;
  if (stage.exits.length > 0 && stage.exits[0].age >= EXIT_TIME) stage.exits = stage.exits.filter((exit) => exit.age < EXIT_TIME);
  for (let i = 0; i < stage.gateGlow.length; i++) stage.gateGlow[i] = Math.max(0, stage.gateGlow[i] - dt);
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
  if (stage.popups.length > 0 && stage.popups[0].age >= 1) stage.popups = stage.popups.filter((popup) => popup.age < 1);

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

/** Stamps one medal's face where `point` is, squashed to `tilt` and turned by `turn`. */
function stamp(g: CanvasRenderingContext2D, stage: Stage, point: Projected, tilt: number, turn: number, shift = 0, narrow = 1): void {
  const k = stage.ratio;
  const rx = R * point.scale * k;
  const ry = rx * tilt;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // `narrow` squeezes it sideways: a medal turned part of the way edge on to the player.
  g.setTransform(rx * cos * narrow, ry * sin, -rx * sin * narrow, ry * cos, (point.x + shift) * k, point.y * k);
  g.drawImage(stage.medal, -1, -1, 2, 2);
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
  g.lineWidth = 1;
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
      if (point && chosen(medals[i])) stamp(g, stage, point, point.tilt, turnOf(medals[i].id), shift);
    }
  };

  const lying = (medal: Medal) => medal.tier === 0 && medal.grown >= 1;
  const dropping = (medal: Medal) => medal.tier === 0 && medal.grown < 1;
  const onTop = (medal: Medal) => medal.tier === 1;
  shadows(lying, 1.9, 'rgba(0, 4, 18, 0.34)');
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
 * jump.
 */
function stampHeld(g: CanvasRenderingContext2D, stage: Stage, at: Spot, turn: number, tilt: number, heading: number, shift: number): void {
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
  g.drawImage(stage.medal, -1, -1, 2, 2);
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

/** How tall the capitals of the words on the catcher's apron are, in field units down its slope. */
export const APRON_CAP = 4.4;
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
 * The catcher's apron, flat: its plate with a gold line along the top and
 * the foot, and the word START under each mouth, as tall as the plate has
 * room for. One unit of the canvas is one field unit; the apron is `CATCHER.to
 * − CATCHER.from` across and `APRON` down. `lit` says how brightly each
 * pocket's stretch of it is lit, from 0 to 1, the left pocket's first. The 3D
 * renderer leaves it out: it paints the apron unlit, once, and lights a
 * stretch by itself.
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

/** A level stretch of the cabinet at `height`: from x0 to x1 across and from depth z0 out to z1. */
const levelPatch = (x0: number, x1: number, height: number, z0: number, z1: number): Projected[] => [project(x0, height, z0), project(x1, height, z0), project(x1, height, z1), project(x0, height, z1)];

/** Adds to the path a round thing lying level with its middle at `at`, as the oval it is seen as, or a part of it from one angle to another: no turn is to the right, a quarter turn toward the player. */
function oval(g: CanvasRenderingContext2D, at: Projected, radius: number, from = 0, to = TAU, back = false): void {
  const rx = radius * at.scale;
  g.ellipse(at.x, at.y, rx, rx * at.tilt, 0, from, to, back);
}

/** A medal that is on its way down a pocket, and where it has got to. */
interface Sinking {
  medal: Medal;
  held: NonNullable<ReturnType<typeof caught>>;
}

/** How far in from the edge of a mouth its throat is: the ring of light inside the rim slopes in by this much. */
const THROAT_IN = 0.4;

/**
 * The catcher that rides on the front of the pusher, under its lip, drawn
 * from the back forward: the shadow it throws on the lower table and the dark
 * under it; its deck, with the dark where it goes in under the lip; for each
 * pocket the rim round its mouth and the throat seen down it — the far wall,
 * which catches the light of the ring above it, and the floor — then any
 * medal on its way down, then the near half of the rim, which is in front of
 * that medal, and the lamps round the rim; the rail along the front of the
 * deck; and the apron with the word START under each mouth. A pocket a medal
 * has just dropped through is gold all the way down, and its stretch of the
 * apron is lit. Everything that lies on the lower table under the catcher has
 * been drawn before it and is covered by it.
 */
function drawCatcher(g: CanvasRenderingContext2D, stage: Stage, machine: Machine, front: number, sinking: readonly Sinking[], phase: number, calm: boolean, shift: number): void {
  const k = stage.ratio;
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);
  const { from, to, deck, rim, rail, foot, throat } = CATCHER;
  const r = CHUCKERS.radius;
  const out = front + foot.out;
  flat();
  g.fillStyle = 'rgba(0, 4, 18, 0.34)';
  path(g, levelPatch(from + foot.height * SUN.x, to + deck * SUN.x, T * 2, out - 1, out + deck * SUN.depth));
  g.fill();
  g.fillStyle = 'rgba(0, 4, 18, 0.55)';
  path(g, facing(from, to, foot.height, 0, out));
  g.fill();

  const plate = levelPatch(from, to, deck, front, front + rail.out - rail.thick);
  const steel = g.createLinearGradient(0, plate[0].y, 0, plate[2].y);
  steel.addColorStop(0, '#7f8aad');
  steel.addColorStop(1, '#dfe5f4');
  g.fillStyle = steel;
  path(g, plate);
  g.fill();
  const under = levelPatch(from, to, deck, front, front + 2.4);
  const dark = g.createLinearGradient(0, under[0].y, 0, under[2].y);
  dark.addColorStop(0, 'rgba(0, 0, 14, 0.8)');
  dark.addColorStop(1, 'rgba(0, 0, 14, 0)');
  g.fillStyle = dark;
  path(g, under);
  g.fill();

  mouthSpots(machine.time).forEach((spot, index) => {
    const lit = stage.gateGlow[index] / GLOW_TIME;
    const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(stage.clock * 3 + index * 2.1);
    const low = project(spot.x, deck, spot.depth);
    const top = project(spot.x, deck + rim.high, spot.depth);
    const floor = project(spot.x, throat, spot.depth);
    const rx = (r + rim.wide) * top.scale;
    const ry = rx * top.tilt;
    const gold = g.createLinearGradient(top.x - rx, 0, top.x + rx, 0);
    gold.addColorStop(0, lit > 0 ? '#ffe9a6' : '#c98c14');
    gold.addColorStop(0.3, lit > 0 ? '#ffffff' : '#fff0b4');
    gold.addColorStop(0.65, lit > 0 ? '#fff3a8' : '#f0bd3c');
    gold.addColorStop(1, lit > 0 ? '#ffd65c' : '#9a6410');
    const lamps = (near: boolean) => {
      for (let i = 0; i < 12; i++) {
        const angle = ((i + 0.5) / 12) * TAU;
        if (Math.sin(angle) > 0 !== near) continue;
        const glow = lit > 0 ? 1 : 0.5 + 0.5 * Math.sin(phase - (i * TAU) / 3 + index);
        const x = top.x + Math.cos(angle) * (r + rim.wide / 2) * top.scale;
        const y = top.y + Math.sin(angle) * (r + rim.wide / 2) * top.scale * top.tilt;
        g.globalAlpha = 0.3 + 0.7 * glow;
        g.fillStyle = lit > 0 ? '#fffbe0' : i % 2 === 0 ? '#7df0ff' : '#d6fbff';
        g.beginPath();
        g.arc(x, y, 0.42 * top.scale, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    };

    // The rim, standing up out of the deck: the wall of it, and its top.
    g.fillStyle = '#7a4f0a';
    g.beginPath();
    oval(g, low, r + rim.wide);
    g.fill();
    g.fillRect(top.x - rx, top.y, rx * 2, low.y - top.y);
    g.fillStyle = gold;
    g.beginPath();
    oval(g, top, r + rim.wide);
    g.fill();
    lamps(false);

    // Down the mouth: the far wall of the throat, lit from above, and under it the floor.
    g.save();
    g.beginPath();
    oval(g, top, r);
    g.clip();
    const wall = g.createLinearGradient(0, top.y - ry, 0, floor.y);
    wall.addColorStop(0, lit > 0 ? '#fffbe0' : '#a58cf5');
    wall.addColorStop(0.45, lit > 0 ? '#ffd65c' : '#3a1a86');
    wall.addColorStop(1, lit > 0 ? '#b77d12' : '#0d0524');
    g.fillStyle = wall;
    g.fillRect(top.x - rx, top.y - ry, rx * 2, ry * 2);
    g.fillStyle = '#000000';
    g.beginPath();
    oval(g, floor, r - THROAT_IN);
    g.fill();
    if (lit > 0) {
      g.fillStyle = `rgba(214, 138, 20, ${0.9 * lit})`;
      g.fill();
    }
    g.restore();
    // The ring of light inside the rim.
    for (const [width, colour] of [
      [1.1, lit > 0 ? `rgba(255, 244, 150, ${0.5 * lit})` : `rgba(255, 124, 192, ${0.22 + 0.16 * pulse})`],
      [0.4, lit > 0 ? '#fffbe0' : `rgba(255, 176, 216, ${0.75 + 0.25 * pulse})`],
    ] as const) {
      g.strokeStyle = colour;
      g.lineWidth = width * top.scale * top.tilt;
      g.beginPath();
      oval(g, top, r - 0.2);
      g.stroke();
    }

    // A medal on its way down: over the far rim while it is still above it, and inside the mouth once it is below.
    for (const { medal, held } of sinking) {
      if (held.chucker !== index) continue;
      const at = project(held.x, held.height + T / 2, held.depth);
      g.save();
      g.beginPath();
      oval(g, top, r);
      g.rect(top.x - rx, top.y - ry * 4, rx * 2, ry * 4);
      g.clip();
      g.globalAlpha = held.light;
      stamp(g, stage, at, at.tilt, turnOf(medal.id), shift);
      g.restore();
      flat();
    }

    // The near half of the rim is in front of whatever is in the mouth.
    g.fillStyle = '#7a4f0a';
    g.beginPath();
    oval(g, low, r + rim.wide, 0, Math.PI);
    oval(g, top, r + rim.wide, Math.PI, 0, true);
    g.fill();
    g.fillStyle = gold;
    g.beginPath();
    oval(g, top, r + rim.wide, 0, Math.PI);
    oval(g, top, r, Math.PI, 0, true);
    g.fill();
    lamps(true);
  });

  // The rail along the front of the deck.
  const bar = levelPatch(from, to, rail.top, front + rail.out - rail.thick, front + rail.out);
  g.fillStyle = '#fff0b4';
  path(g, bar);
  g.fill();

  // The apron: its plate, then what is printed on it, laid on as a flat sheet stood on its slope.
  const span = to - from;
  const corners = [apronSpot(0, 0, machine.time), apronSpot(span, 0, machine.time), apronSpot(span, APRON, machine.time), apronSpot(0, APRON, machine.time)].map((spot) => project(spot.x, spot.height, spot.depth));
  g.save();
  path(g, corners);
  g.clip();
  g.fillStyle = '#d81b78';
  g.fill();
  const middle = apronSpot(span / 2, 0, machine.time);
  const lower = apronSpot(span / 2, 1, machine.time);
  const o = project(middle.x, middle.height, middle.depth);
  const u = project(middle.x + 1, middle.height, middle.depth);
  const v = project(lower.x, lower.height, lower.depth);
  const ax = u.x - o.x;
  const ay = u.y - o.y;
  g.setTransform(ax * k, ay * k, (v.x - o.x) * k, (v.y - o.y) * k, (o.x - (span / 2) * ax + shift) * k, (o.y - (span / 2) * ay) * k);
  paintApron(
    g,
    stage.gateGlow.map((glow) => glow / GLOW_TIME),
  );
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
  /** How many jewels have been collected since the jewel lamps last went out, which is how many of them are lit. */
  jewels?: number;
}

/** Draws one frame of the field. */
export function drawField(g: CanvasRenderingContext2D, stage: Stage, machine: Machine, options: DrawOptions): void {
  const k = stage.ratio;
  const calm = options.calm ?? false;
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
  for (let i = 0; i < 8; i++) {
    const lamp = project(HOLD_LAMPS.first + HOLD_LAMPS.step * i, (HOUSING.shelf + SCREEN.foot) / 2, HOUSING.ledge);
    const r = HOLD_LAMPS.radius * lamp.scale;
    if (i < held) {
      g.fillStyle = 'rgba(255, 214, 92, 0.3)';
      g.beginPath();
      g.arc(lamp.x, lamp.y, r * 2.2, 0, TAU);
      g.fill();
    }
    g.fillStyle = i < held ? '#ffd65c' : '#2a1f5c';
    g.beginPath();
    g.arc(lamp.x, lamp.y, r, 0, TAU);
    g.fill();
    g.fillStyle = i < held ? '#fffbe0' : '#4a3d8a';
    g.beginPath();
    g.arc(lamp.x - r * 0.25, lamp.y - r * 0.25, r * 0.45, 0, TAU);
    g.fill();
  }
  bulbs(g, project(0, HEIGHT.sideWall + 2, 2), project(0, HEIGHT.sideWall + 2, OPEN - 2), 12, phase, lights, 2.2);
  bulbs(g, project(W, HEIGHT.sideWall + 2, 2), project(W, HEIGHT.sideWall + 2, OPEN - 2), 12, phase, lights, 2.2);

  // The arrows on the chutes beside the open sides glow one after another, away from the wall and toward the
  // player, which is the way a medal that is lost goes. A chute a medal has just gone down is lit for a moment.
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const index of [0, 1]) {
    const side = index === 0 ? -1 : 1;
    for (let i = 0; i < CHUTE.marks.length; i++) {
      const glow = calm ? 0.3 : 0.12 + 0.5 * Math.max(0, Math.sin(stage.clock * 3.2 - i * 1.3));
      g.strokeStyle = `rgba(255, 150, 160, ${glow})`;
      g.lineWidth = 7;
      chuteArrow(g, side, CHUTE.marks[i]);
    }
    if (stage.sideGlow[index] <= 0) continue;
    g.fillStyle = `rgba(255, 70, 96, ${0.45 * (stage.sideGlow[index] / GLOW_TIME)})`;
    path(g, chutePatch(side));
    g.fill();
  }
  if (stage.trayGlow > 0) {
    g.fillStyle = `rgba(255, 214, 92, ${0.4 * (stage.trayGlow / GLOW_TIME)})`;
    path(g, [project(0, 0, D), project(W, 0, D), project(W, -18, D), project(0, -18, D)]);
    g.fill();
  }
  bulbs(g, project(2, -3, D), project(W - 2, -3, D), 30, phase, ['#ffd65c', '#fff3a8'], 2.4);

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
  // covers them. Two things come after it: a medal on its way down one of its pockets, which is drawn with the
  // pocket, and a ball whose middle has come out from under its front, which is taller than it and stands before it.
  // A ball that has only just come over the lip behind the catcher is still going down behind it, and is drawn
  // last of all the medals, as far as it shows over the catcher's deck; so is a medal that came over beside a pocket.
  // A jewel is lower than the catcher and lies under it like a medal. Every list is drawn from the back forward, so
  // that of two things that overlap, the nearer is the one seen.
  const lower: Medal[] = [];
  const upper: Medal[] = [];
  const sinking: Sinking[] = [];
  const tipping: Sinking[] = [];
  const clear: Medal[] = [];
  const going: Medal[] = [];
  for (const medal of machine.medals) {
    if (medal.level === 1) {
      upper.push(medal);
      continue;
    }
    const held = caught(medal, machine.time);
    if (held && held.chucker >= 0) sinking.push({ medal, held });
    else if (held) tipping.push({ medal, held });
    else if (medal.ball && medal.y >= front + CATCHER.foot.out && underCatcher(medal.x, medal.y, BALL_RADIUS * 2, machine.time)) clear.push(medal);
    else if (medal.ball && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL && medal.x - BALL_RADIUS >= CATCHER.from && medal.x + BALL_RADIUS <= CATCHER.to) going.push(medal);
    else lower.push(medal);
  }
  lower.sort(byDepth);
  upper.sort(byDepth);
  clear.sort(byDepth);
  going.sort(byDepth);
  tipping.sort((a, b) => byDepth(a.medal, b.medal));
  /** The jewels among some medals, each drawn where it lies: after the medals of its table, as a ball is. */
  const jewelsOf = (medals: readonly Medal[]) => {
    for (const medal of medals) if (medal.jewel) drawJewel(g, stage, lyingJewel(medal, machine.time), medal.level === 1 || medal.sinceDrop < 0 || medal.sinceDrop >= LIP_FALL, calm, shake);
  };
  drawMedals(g, stage, lower, 0, shake);
  jewelsOf(lower);
  drawCatcher(g, stage, machine, front, sinking, phase, calm, shake);
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
  drawMedals(g, stage, upper, P, shake);
  jewelsOf(upper);
  // A medal that came over the lip at the catcher without fitting a pocket tips over the edge and goes down behind
  // the catcher, on its edge. It is drawn where the catcher has it, not lying where the engine has already put it,
  // and only as much of it as still stands over the catcher's deck. A jewel fits no pocket and goes the same way.
  for (const { medal, held } of tipping) {
    const point = project(held.x, held.height, held.depth);
    flat();
    g.save();
    g.beginPath();
    g.rect(-VIEW.width, 0, VIEW.width * 3, project(held.x, CATCHER.deck, front).y);
    g.clip();
    if (medal.jewel) drawJewel(g, stage, lyingJewel(medal, machine.time), false, calm, shake);
    else stamp(g, stage, point, Math.max(0.12, point.tilt * Math.abs(Math.cos(held.tilt))), turnOf(medal.id), shake);
    g.restore();
  }
  for (const ball of going) {
    const from = P + BALL_RADIUS;
    const middle = from - (from - (CATCHER.deck - BALL_RADIUS - 0.2)) * (ball.sinceDrop / LIP_FALL) ** 2;
    flat();
    g.save();
    g.beginPath();
    g.rect(-VIEW.width, 0, VIEW.width * 3, project(ball.x, CATCHER.deck, ball.y + BALL_RADIUS * 0.7).y);
    g.clip();
    drawBall(g, stage, ball.x, middle - BALL_RADIUS, ball.y, false, shake);
    g.restore();
  }
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
  const railOut = front + CATCHER.rail.out;
  const footOut = front + CATCHER.foot.out;
  for (const [x, height, depth] of [
    [CATCHER.from, CATCHER.deck, front],
    [CATCHER.to, CATCHER.deck, front],
    [CATCHER.to, CATCHER.rail.top, railOut],
    [CATCHER.to, CATCHER.foot.height, footOut],
    [CATCHER.from, CATCHER.foot.height, footOut],
    [CATCHER.from, CATCHER.rail.top, railOut],
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
  for (const medal of machine.falling) {
    if (medal.ball || medal.jewel) continue;
    const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
    if (medal.source === 'spill') {
      const from = P + T * (medal.rank + 1);
      const point = project(medal.fromX + (medal.x - medal.fromX) * t, T + (from - T) * (1 - t * t), medal.fromY + (medal.y - medal.fromY) * t);
      stamp(g, stage, point, point.tilt * (0.4 + 0.6 * Math.abs(Math.cos(t * 9 + medal.id))), turnOf(medal.id) + t * 5, shake);
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
    stamp(g, stage, point, (0.14 + 0.78 * flip) * (1 - landing) + point.tilt * landing, turnOf(medal.id), shake);
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

  // Whatever has just left the field: it goes on the way it was pushed, tips over the edge and falls.
  for (const exit of stage.exits) {
    const a = exit.age;
    const won = exit.kind === 'won';
    const fall = (EXIT.gravity * a * a) / 2;
    const x = exit.x + (won ? 0 : exit.side * EXIT.sideways * a);
    const depth = exit.y + (won ? EXIT.forward * a : 0);
    // Over the front it drops out of sight below the edge of the glass; into a side pit it is lost in the dark.
    g.globalAlpha = won ? 1 : Math.max(0, 1 - (a / (EXIT_TIME * 0.7)) ** 2);
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
    stamp(g, stage, point, Math.max(0.12, point.tilt * Math.abs(Math.cos(turn))), turnOf(exit.id), shake);
  }
  g.globalAlpha = 1;
  drawOverlay(g, stage, calm);
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
    g.globalAlpha = Math.max(0, 1 - popup.age ** 2);
    const y = popup.y - popup.age * 46;
    g.lineWidth = 5;
    g.strokeStyle = popup.color ? '#3d0420' : '#3a2400';
    g.strokeText(popup.text, popup.x, y);
    g.fillStyle = popup.color ?? '#ffe98a';
    g.fillText(popup.text, popup.x, y);
  }
  g.globalAlpha = 1;

  // A fever or a jackpot washes the cabinet with colour.
  if (!calm && partying) {
    const hue = (stage.clock * 160) % 360;
    g.fillStyle = `hsla(${hue}, 100%, 60%, ${(0.07 + 0.05 * Math.sin(stage.clock * 12)) * wash})`;
    g.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  // The glass in front of it all: two bands of reflected light.
  const glass = g.createLinearGradient(0, 0, VIEW.width, VIEW.height * 0.9);
  glass.addColorStop(0.18, 'rgba(255, 255, 255, 0)');
  glass.addColorStop(0.24, 'rgba(255, 255, 255, 0.07)');
  glass.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
  glass.addColorStop(0.36, 'rgba(255, 255, 255, 0.04)');
  glass.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
  g.fillStyle = glass;
  g.fillRect(0, 0, VIEW.width, VIEW.height);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
