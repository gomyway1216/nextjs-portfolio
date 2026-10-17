/**
 * What is printed on the cabinet, painted flat with a canvas and handed to
 * the 3D renderer as textures: the lower table with its lanes and lettering,
 * the panel under the screen, the side walls, the top of the pusher, the
 * front of the table, and the two START signs on the START plate. And one
 * thing that is not paint: the relief struck into a medal's face.
 */

import { SIGN } from './catcher';
import { FIELD, PUSHER } from './engine';
import { JEWEL_LAMPS, JEWEL_PLATE, LAMP_OUTLINE, jewelLampX } from './jewel';
import { FACE_STAR } from './medalLook';
import { TABLE_WORDS, TRAY, paintStartSign, starPath } from './render';
import { SIDE_HOLE, acrossAt } from './sidehole';
import { HEIGHT, HOLD_LAMPS, HOUSING, SCREEN } from './view';

const TAU = Math.PI * 2;
const W = FIELD.width;
const D = FIELD.depth;
const P = HEIGHT.pusher;

/** How far down the front of the table goes. */
export const TRAY_DROP = 18;
/** How many pixels of the START signs are painted to a field unit: their words are read at the nearest the camera gets to anything printed. */
export const SIGN_SHARPNESS = 28;

/** A canvas `width` by `height` field units, drawn on in those units. */
function sheet(width: number, height: number, perUnit: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * perUnit);
  canvas.height = Math.round(height * perUnit);
  const g = canvas.getContext('2d');
  g?.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  return { canvas, g };
}

/** How many strokes of the brush are drawn across the lower table's steel. */
export const BRUSH_STROKES = 2400;

/**
 * Numbers from 0 to 1 that come out the same every time they are asked for
 * from the same start: the table is brushed and scuffed the same on every
 * device and in every test.
 */
function scatter(start: number): () => number {
  let seed = start;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * The lower table from above: across is across, down is toward the player.
 * It is a sheet of stainless steel, brushed across, as the table of a real
 * pusher is: grey, with a blue cast from the cabinet's light. Medals have
 * slid down the middle of it for years and worn the brushing bright there;
 * along the rails and under the pusher, where nothing sweeps it, it is dull
 * with dirt. What is printed on it is printed on the steel and has worn with it.
 */
export function paintTable(): HTMLCanvasElement {
  const { canvas, g } = sheet(W, D, 10.24);
  if (!g) return canvas;
  const plate = g.createLinearGradient(0, 0, 0, D);
  plate.addColorStop(0, '#39414f');
  plate.addColorStop(0.5, '#56606f');
  plate.addColorStop(1, '#727c8a');
  g.fillStyle = plate;
  g.fillRect(0, 0, W, D);
  // The brushing: fine strokes across the sheet, lighter and darker than it by turns.
  const random = scatter(7);
  for (let stroke = 0; stroke < BRUSH_STROKES; stroke++) {
    const x = random() * W;
    const y = random() * D;
    const long = 5 + random() * 28;
    const strength = 0.03 + random() * 0.06;
    g.fillStyle = stroke % 2 === 0 ? `rgba(236, 244, 255, ${strength.toFixed(3)})` : `rgba(6, 10, 20, ${(strength * 1.3).toFixed(3)})`;
    g.fillRect(x - long / 2, y, long, 0.05 + random() * 0.09);
  }
  // Worn bright where the heap slides, most toward the front edge it goes over.
  const worn = g.createLinearGradient(0, 0, W, 0);
  worn.addColorStop(0.08, 'rgba(226, 236, 250, 0)');
  worn.addColorStop(0.5, 'rgba(226, 236, 250, 0.16)');
  worn.addColorStop(0.92, 'rgba(226, 236, 250, 0)');
  g.fillStyle = worn;
  g.fillRect(0, PUSHER.min, W, D - PUSHER.min);
  // Dull with dirt along either rail and back under the pusher.
  for (const [from, to] of [
    [0, 9],
    [W, W - 9],
  ]) {
    const dirt = g.createLinearGradient(from, 0, to, 0);
    dirt.addColorStop(0, 'rgba(14, 12, 16, 0.5)');
    dirt.addColorStop(1, 'rgba(14, 12, 16, 0)');
    g.fillStyle = dirt;
    g.fillRect(Math.min(from, to), 0, 9, D);
  }
  const under = g.createLinearGradient(0, 0, 0, PUSHER.max + 8);
  under.addColorStop(0, 'rgba(8, 8, 14, 0.62)');
  under.addColorStop(1, 'rgba(8, 8, 14, 0)');
  g.fillStyle = under;
  g.fillRect(0, 0, W, PUSHER.max + 8);
  // Lanes scribed into the steel: a dark line with a bright edge to it.
  for (let x = 10; x < W; x += 10) {
    g.fillStyle = 'rgba(8, 12, 22, 0.3)';
    g.fillRect(x - 0.12, PUSHER.min, 0.24, D - PUSHER.min);
    g.fillStyle = 'rgba(236, 244, 255, 0.14)';
    g.fillRect(x + 0.12, PUSHER.min, 0.1, D - PUSHER.min);
  }
  // The emblem, etched: two rings and a star, a shade darker than the sheet.
  g.strokeStyle = 'rgba(10, 16, 30, 0.26)';
  g.lineWidth = 0.9;
  for (const radius of [20, 15.5]) {
    g.beginPath();
    g.arc(W / 2, 70, radius, 0, TAU);
    g.stroke();
  }
  starPath(g, W / 2, 70, 13, 5.4);
  g.fillStyle = 'rgba(10, 16, 30, 0.2)';
  g.fill();
  // The words the player needs, printed on the steel in enamel that the medals have rubbed thin.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 6.5px "Arial Black", Arial, sans-serif';
  g.fillStyle = 'rgba(244, 208, 96, 0.6)';
  for (const x of TABLE_WORDS.get) g.fillText('GET', x, TABLE_WORDS.getAt);
  g.font = '900 4.6px "Arial Black", Arial, sans-serif';
  g.fillStyle = 'rgba(232, 96, 110, 0.7)';
  for (const [x, depth] of TABLE_WORDS.out) for (const across of [x, W - x]) g.fillText('OUT', across, depth);
  // The stretch before each side hole's mouth is painted red toward the edge, and a red line is scribed where the
  // tray's stretch begins: what is pushed over the edge outside the lines is not the player's.
  for (const side of [-1, 1]) {
    const from = Math.min(side < 0 ? 0 : W, acrossAt(SIDE_HOLE.reach, side));
    const wash = g.createLinearGradient(0, TABLE_WORDS.washFrom, 0, D);
    wash.addColorStop(0, 'rgba(232, 60, 84, 0)');
    wash.addColorStop(1, 'rgba(232, 60, 84, 0.38)');
    g.fillStyle = wash;
    g.fillRect(from, TABLE_WORDS.washFrom, SIDE_HOLE.reach, D - TABLE_WORDS.washFrom);
    g.fillStyle = 'rgba(255, 107, 129, 0.75)';
    g.fillRect(acrossAt(SIDE_HOLE.reach, side) - 0.14, TABLE_WORDS.washFrom, 0.28, D - TABLE_WORDS.washFrom);
  }
  // Scuffs: short bright scratches, any way round, thickest where the medals turn at the front.
  for (let scuff = 0; scuff < 160; scuff++) {
    const x = random() * W;
    const y = PUSHER.min + (1 - random() * random()) * (D - PUSHER.min);
    const long = 0.6 + random() * 2.4;
    const turn = random() * Math.PI;
    g.strokeStyle = `rgba(240, 246, 255, ${(0.08 + random() * 0.14).toFixed(3)})`;
    g.lineWidth = 0.06 + random() * 0.07;
    g.beginPath();
    g.moveTo(x - Math.cos(turn) * long, y - Math.sin(turn) * long);
    g.lineTo(x + Math.cos(turn) * long, y + Math.sin(turn) * long);
    g.stroke();
  }
  return canvas;
}

/** How much of the picture below is the front of the shelf: the rest is the panel under it. */
export const SHELF_SHARE = (SCREEN.foot - HOUSING.shelf) / (SCREEN.foot - P);

/**
 * The wall under the screen, from the front. The top of the picture is the
 * foot of the screen. First comes the front of the shelf, a gold bar with a
 * dark bed let into it for the hold's lamps and the word that names them;
 * under it, the panel down to the top of the pusher, which comes out from
 * under it. The lamps themselves stand out of the bed and are not paint.
 */
export function paintFoot(): HTMLCanvasElement {
  const tall = SCREEN.foot - P;
  const shelf = SCREEN.foot - HOUSING.shelf;
  const { canvas, g } = sheet(W, tall, 10.24);
  if (!g) return canvas;
  const shade = g.createLinearGradient(0, shelf, 0, tall);
  shade.addColorStop(0, '#3a1a86');
  shade.addColorStop(0.55, '#24105e');
  shade.addColorStop(1, '#120735');
  g.fillStyle = shade;
  g.fillRect(0, shelf, W, tall - shelf);
  // Rays fanning down from under the shelf, pink and cyan by turns.
  for (let i = 0; i < 18; i++) {
    const from = Math.PI * (i / 18);
    g.fillStyle = i % 2 === 0 ? 'rgba(255, 120, 200, 0.1)' : 'rgba(120, 220, 255, 0.08)';
    g.beginPath();
    g.moveTo(W / 2, shelf - 6);
    g.arc(W / 2, shelf - 6, 90, from, from + Math.PI / 18);
    g.closePath();
    g.fill();
  }
  // The shade the shelf throws on the panel, and the dark where the pusher goes in under it.
  const under = g.createLinearGradient(0, shelf, 0, shelf + 4);
  under.addColorStop(0, 'rgba(4, 0, 18, 0.7)');
  under.addColorStop(1, 'rgba(4, 0, 18, 0)');
  g.fillStyle = under;
  g.fillRect(0, shelf, W, 4);
  const dark = g.createLinearGradient(0, tall - 5, 0, tall);
  dark.addColorStop(0, 'rgba(4, 0, 18, 0)');
  dark.addColorStop(1, 'rgba(4, 0, 18, 0.8)');
  g.fillStyle = dark;
  g.fillRect(0, tall - 5, W, 5);

  // The front of the shelf: gold, with the bed for the lamps.
  const gold = g.createLinearGradient(0, 0, 0, shelf);
  gold.addColorStop(0, '#fff0b4');
  gold.addColorStop(0.2, '#f0bd3c');
  gold.addColorStop(0.75, '#b77d12');
  gold.addColorStop(1, '#6e4706');
  g.fillStyle = gold;
  g.fillRect(0, 0, W, shelf);
  const last = HOLD_LAMPS.first + HOLD_LAMPS.step * (HOLD_LAMPS.count - 1);
  const bed = { left: HOLD_LAMPS.label - 6.2, right: last + HOLD_LAMPS.radius + 1.3 };
  g.fillStyle = '#12082e';
  g.fillRect(bed.left, 0.45, bed.right - bed.left, shelf - 0.9);
  g.strokeStyle = 'rgba(255, 236, 170, 0.9)';
  g.lineWidth = 0.18;
  g.strokeRect(bed.left, 0.45, bed.right - bed.left, shelf - 0.9);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 2.1px "Arial Black", Arial, sans-serif';
  g.fillStyle = '#ffe98a';
  g.fillText('HOLD', HOLD_LAMPS.label, shelf / 2 + 0.1);
  // A socket for each lamp.
  for (let i = 0; i < HOLD_LAMPS.count; i++) {
    g.fillStyle = '#05020f';
    g.beginPath();
    g.arc(HOLD_LAMPS.first + HOLD_LAMPS.step * i, shelf / 2, HOLD_LAMPS.radius + 0.28, 0, TAU);
    g.fill();
  }
  return canvas;
}

/**
 * A side wall above its rail, from inside: the back of the cabinet is on the
 * left, the top at the top. It is panelled in dark mirror, each panel in a
 * gold frame with a strip of light up either side of it and a diamond of
 * lamps in its middle.
 */
export function paintWall(): HTMLCanvasElement {
  const length = FIELD.sideOpenFrom;
  const height = HEIGHT.top - HEIGHT.sideWall;
  const { canvas, g } = sheet(length, height, 6.5);
  if (!g) return canvas;
  const shade = g.createLinearGradient(0, 0, length, 0);
  shade.addColorStop(0, '#221a4a');
  shade.addColorStop(1, '#120d2c');
  g.fillStyle = shade;
  g.fillRect(0, 0, length, height);
  const lift = g.createLinearGradient(0, 0, 0, height);
  lift.addColorStop(0, 'rgba(160, 150, 220, 0.16)');
  lift.addColorStop(1, 'rgba(0, 0, 12, 0.34)');
  g.fillStyle = lift;
  g.fillRect(0, 0, length, height);
  const panel = 13;
  for (let depth = 0; depth < length; depth += panel) {
    // What a dark mirror shows of the lit field: a slanting band of light across each panel.
    const gleam = g.createLinearGradient(depth, 0, depth + panel, height * 0.5);
    gleam.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
    gleam.addColorStop(0.45, 'rgba(190, 170, 255, 0.16)');
    gleam.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
    g.fillStyle = gleam;
    g.fillRect(depth, 0, panel, height);
    // Its frame, of brass moulding that has gone dull: a dark line under it where it stands off the mirror.
    g.strokeStyle = 'rgba(4, 2, 12, 0.5)';
    g.lineWidth = 0.5;
    g.strokeRect(depth + 1.05, 2.4, panel - 1.8, height - 4.4);
    g.strokeStyle = 'rgba(206, 168, 92, 0.72)';
    g.strokeRect(depth + 0.9, 2.2, panel - 1.8, height - 4.4);
    // A strip of light inside each upright of it: a tube behind frosted plastic, not a line of neon.
    g.fillStyle = 'rgba(255, 170, 215, 0.34)';
    g.fillRect(depth + 1.6, 3.4, 0.65, height - 6.8);
    g.fillStyle = 'rgba(150, 232, 250, 0.3)';
    g.fillRect(depth + panel - 2.25, 3.4, 0.65, height - 6.8);
    // A diamond of lamps in the middle of the panel, and one above and below it.
    g.fillStyle = 'rgba(255, 236, 170, 0.62)';
    for (const up of [0.28, 0.5, 0.72]) {
      const size = up === 0.5 ? 1.5 : 0.8;
      g.beginPath();
      g.moveTo(depth + panel / 2, height * up - size * 1.5);
      g.lineTo(depth + panel / 2 + size, height * up);
      g.lineTo(depth + panel / 2, height * up + size * 1.5);
      g.lineTo(depth + panel / 2 - size, height * up);
      g.closePath();
      g.fill();
    }
  }
  return canvas;
}

/**
 * The top of the pusher from above: a box of clear acrylic, tinted like ice.
 * The top of the picture is its front lip, which everything on it travels
 * with. Clear plastic shows by its edges, which catch the light, and by what
 * is seen through it, which here is the dark inside the box and the ribs
 * that brace it.
 */
export function paintPusher(): HTMLCanvasElement {
  const { canvas, g } = sheet(W, PUSHER.max, 10.24);
  if (!g) return canvas;
  const inside = g.createLinearGradient(0, 0, 0, PUSHER.max);
  inside.addColorStop(0, '#5ec4e6');
  inside.addColorStop(0.25, '#2d86b4');
  inside.addColorStop(1, '#12466f');
  g.fillStyle = inside;
  g.fillRect(0, 0, W, PUSHER.max);
  // The ribs inside the box, seen through its top: pale lines across it and along it, each with the dark of its own shadow beside it.
  for (let back = 9; back < PUSHER.max; back += 9) {
    g.fillStyle = 'rgba(6, 30, 60, 0.45)';
    g.fillRect(0, back + 0.35, W, 0.5);
    g.fillStyle = 'rgba(214, 248, 255, 0.55)';
    g.fillRect(0, back, W, 0.35);
  }
  for (let x = 12.5; x < W; x += 12.5) {
    g.fillStyle = 'rgba(6, 30, 60, 0.3)';
    g.fillRect(x + 0.3, 0, 0.4, PUSHER.max);
    g.fillStyle = 'rgba(214, 248, 255, 0.35)';
    g.fillRect(x, 0, 0.3, PUSHER.max);
  }
  // What the polished top mirrors of the lamps over it: broad soft bands across.
  for (const [at, wide, strength] of [
    [5, 5, 0.22],
    [19, 3, 0.12],
    [33, 6, 0.1],
  ]) {
    const band = g.createLinearGradient(0, at - wide, 0, at + wide);
    band.addColorStop(0, 'rgba(255, 255, 255, 0)');
    band.addColorStop(0.5, `rgba(255, 255, 255, ${strength})`);
    band.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = band;
    g.fillRect(0, at - wide, W, wide * 2);
  }
  // The lip: the edge of the sheet, bright all along, and chevrons printed behind it.
  g.fillStyle = 'rgba(255, 196, 40, 0.8)';
  for (let x = 4; x < W; x += 8) {
    g.beginPath();
    g.moveTo(x, 0.9);
    g.lineTo(x + 4, 0.9);
    g.lineTo(x + 2, 3.2);
    g.lineTo(x - 2, 3.2);
    g.closePath();
    g.fill();
  }
  g.fillStyle = 'rgba(236, 252, 255, 0.95)';
  g.fillRect(0, 0, W, 0.6);
  return canvas;
}

/**
 * The front of the table, down to the tray: arrows pointing the way the
 * winnings go, and in the middle the plate for the jewel lamps, dark in a
 * gold frame, with a socket the shape of a cut stone for each lamp. The lamps
 * themselves light up and are not paint.
 */
export function paintLip(): HTMLCanvasElement {
  const { canvas, g } = sheet(W, TRAY_DROP, 10.24);
  if (!g) return canvas;
  const shade = g.createLinearGradient(0, 0, 0, TRAY_DROP);
  shade.addColorStop(0, '#0d2e50');
  shade.addColorStop(1, '#040b16');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, TRAY_DROP);
  g.strokeStyle = 'rgba(255, 214, 92, 0.85)';
  g.lineWidth = 0.45;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // One arrow to either side of the jewel lamps' plate, as the canvas has them.
  const halfArrow = Math.min(3.2, (JEWEL_PLATE.from - TRAY.from) / 2 - 0.4);
  for (const x of [(TRAY.from + JEWEL_PLATE.from) / 2, (JEWEL_PLATE.to + TRAY.to) / 2]) {
    g.beginPath();
    g.moveTo(x - halfArrow, 7.5);
    g.lineTo(x, 13);
    g.lineTo(x + halfArrow, 7.5);
    g.stroke();
  }
  // The picture runs down from the table's edge, so a height under the edge is that far down it.
  g.fillStyle = '#16072a';
  g.fillRect(JEWEL_PLATE.from, -JEWEL_PLATE.top, JEWEL_PLATE.to - JEWEL_PLATE.from, JEWEL_PLATE.top - JEWEL_PLATE.foot);
  g.strokeStyle = '#ffd65c';
  g.lineWidth = 0.3;
  g.strokeRect(JEWEL_PLATE.from, -JEWEL_PLATE.top, JEWEL_PLATE.to - JEWEL_PLATE.from, JEWEL_PLATE.top - JEWEL_PLATE.foot);
  for (let lamp = 0; lamp < JEWEL_LAMPS.count; lamp++) {
    g.beginPath();
    LAMP_OUTLINE.forEach(([across, up], corner) => {
      const x = jewelLampX(lamp) + across * JEWEL_LAMPS.radius;
      const y = -(JEWEL_LAMPS.height + up * JEWEL_LAMPS.radius);
      if (corner === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
    g.fillStyle = '#05020f';
    g.fill();
    g.strokeStyle = 'rgba(255, 124, 192, 0.5)';
    g.lineWidth = 0.18;
    g.stroke();
  }
  return canvas;
}

/**
 * The two START signs on the START plate, side by side, the left one first:
 * each with the word START and chevrons pointing to the holes. The top of the
 * picture is the edge of the sign nearest the lip.
 */
export function paintSign(): HTMLCanvasElement {
  const { canvas, g } = sheet(SIGN.wide * 2, SIGN.long, SIGN_SHARPNESS);
  if (g) {
    paintStartSign(g, -1);
    g.translate(SIGN.wide, 0);
    paintStartSign(g, 1);
  }
  return canvas;
}

/** Plain white, for everything that has nothing printed on it. */
export function paintPlain(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 4;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 4, 4);
  }
  return canvas;
}

// ── The face of a medal ─────────────────────────────────────────────────────

/** The corners of the star on a medal's face, as shares of the medal's radius: the one every renderer strikes (medalLook.ts). */
const STAR = FACE_STAR;

/** How far inside the star a point is; negative outside it. */
function insideStar(x: number, y: number): number {
  let nearest = Infinity;
  let inside = false;
  for (let i = 0, j = STAR.length - 1; i < STAR.length; j = i++) {
    const [ax, ay] = STAR[i];
    const [bx, by] = STAR[j];
    const ex = bx - ax;
    const ey = by - ay;
    const along = Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
    nearest = Math.min(nearest, (x - ax - ex * along) ** 2 + (y - ay - ey * along) ** 2);
    if (ay > y !== by > y && x < ax + ((y - ay) / ey) * ex) inside = !inside;
  }
  return (inside ? 1 : -1) * Math.sqrt(nearest);
}

const BEADS = 28;
const ease = (from: number, to: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * How high the face of a medal stands at a point, from 0 (the field) to 1.
 * `x` and `y` are shares of the medal's radius from its middle. A raised
 * border, a ring of beads inside it, a fine ring, and a star of four long
 * points and four short ones, which reads as a cross from a step away.
 */
export function reliefHeight(x: number, y: number): number {
  const r = Math.hypot(x, y);
  const border = ease(0.78, 0.815, r) * (1 - ease(0.9, 0.95, r));
  const step = TAU / BEADS;
  const bead = Math.round(Math.atan2(y, x) / step) * step;
  const toBead = Math.hypot(x - Math.cos(bead) * 0.7, y - Math.sin(bead) * 0.7);
  const beads = Math.max(0, 1 - (toBead / 0.042) ** 2);
  const ring = Math.max(0, 1 - ((r - 0.6) / 0.022) ** 2);
  const star = Math.min(1, Math.max(0, insideStar(x, y) / 0.075));
  return Math.max(border, beads * 0.8, ring * 0.55, star);
}

/**
 * The relief as a texture, `size` texels square over the medal's full width:
 * in each texel the way the surface leans (two bytes), how high it stands
 * (one), and how steep it is (one). The shader bends the light with the
 * first, brightens what stands up with the second, and with the third
 * darkens the foot of every edge, where a medal that has been handled is
 * dark: that outline is what still shows the star and the ring when the
 * medal is too small on the screen for the light to draw them.
 */
export function reliefMap(size: number): Uint8Array {
  const heights = new Float32Array(size * size);
  const at = (i: number) => ((i + 0.5) / size) * 2 - 1;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) heights[j * size + i] = reliefHeight(at(i), at(j));
  const bytes = new Uint8Array(size * size * 4);
  const height = (i: number, j: number) => heights[Math.min(size - 1, Math.max(0, j)) * size + Math.min(size - 1, Math.max(0, i))];
  // The relief is about a fiftieth of the radius deep; a texel is 2 / size of the radius wide.
  const steep = (0.02 * size) / 4;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = (height(i + 1, j) - height(i - 1, j)) * steep;
      const dy = (height(i, j + 1) - height(i, j - 1)) * steep;
      const length = Math.hypot(dx, dy, 1);
      const o = (j * size + i) * 4;
      bytes[o] = Math.round((-dx / length) * 127.5 + 127.5);
      bytes[o + 1] = Math.round((-dy / length) * 127.5 + 127.5);
      bytes[o + 2] = Math.round(heights[j * size + i] * 255);
      bytes[o + 3] = Math.round(Math.min(1, Math.hypot(dx, dy) * 2.4) * 255);
    }
  }
  return bytes;
}
