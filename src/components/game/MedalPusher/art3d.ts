/**
 * What is printed on the cabinet, painted flat with a canvas and handed to
 * the 3D renderer as textures: the lower table with its lanes and lettering,
 * the panel under the screen, the side walls, the top of the pusher, the
 * front of the table and the sign over a gate. And one thing that is not
 * paint: the relief struck into a medal's face.
 */

import { FIELD, PUSHER } from './engine';
import { starPath } from './render';
import { HEIGHT, HOLD_LAMPS, HOUSING, SCREEN } from './view';

const TAU = Math.PI * 2;
const W = FIELD.width;
const D = FIELD.depth;
const P = HEIGHT.pusher;

/** How far down the front of the table goes. */
export const TRAY_DROP = 18;
/** The sign over a gate: how wide and how tall, in field units. */
export const SIGN = { width: 12, height: 3.4 } as const;

/** A canvas `width` by `height` field units, drawn on in those units. */
function sheet(width: number, height: number, perUnit: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * perUnit);
  canvas.height = Math.round(height * perUnit);
  const g = canvas.getContext('2d');
  g?.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  return { canvas, g };
}

/** The lower table from above: across is across, down is toward the player. */
export function paintTable(): HTMLCanvasElement {
  const { canvas, g } = sheet(W, D, 10.24);
  if (!g) return canvas;
  const plate = g.createLinearGradient(0, 0, 0, D);
  plate.addColorStop(0, '#08213f');
  plate.addColorStop(0.5, '#0d3f72');
  plate.addColorStop(1, '#1973b6');
  g.fillStyle = plate;
  g.fillRect(0, 0, W, D);
  // Lanes, an emblem and the words the player needs.
  g.strokeStyle = 'rgba(160, 215, 255, 0.13)';
  g.lineWidth = 0.3;
  for (let x = 10; x < W; x += 10) {
    g.beginPath();
    g.moveTo(x, PUSHER.min);
    g.lineTo(x, D);
    g.stroke();
  }
  g.strokeStyle = 'rgba(150, 215, 255, 0.2)';
  g.lineWidth = 0.9;
  for (const radius of [20, 15.5]) {
    g.beginPath();
    g.arc(W / 2, 70, radius, 0, TAU);
    g.stroke();
  }
  starPath(g, W / 2, 70, 13, 5.4);
  g.fillStyle = 'rgba(150, 215, 255, 0.15)';
  g.fill();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 6.5px "Arial Black", Arial, sans-serif';
  g.fillStyle = 'rgba(255, 226, 120, 0.5)';
  for (const x of [20, 50, 80]) g.fillText('GET', x, 93.5);
  g.font = '900 4.6px "Arial Black", Arial, sans-serif';
  g.fillStyle = 'rgba(255, 130, 150, 0.6)';
  for (const x of [7.5, W - 7.5]) g.fillText('OUT', x, 84);
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
  const last = HOLD_LAMPS.first + HOLD_LAMPS.step * 7;
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
  for (let i = 0; i < 8; i++) {
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
  shade.addColorStop(0, '#2c1b6c');
  shade.addColorStop(1, '#170c40');
  g.fillStyle = shade;
  g.fillRect(0, 0, length, height);
  const lift = g.createLinearGradient(0, 0, 0, height);
  lift.addColorStop(0, 'rgba(170, 140, 255, 0.22)');
  lift.addColorStop(1, 'rgba(0, 0, 20, 0.25)');
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
    // Its gold frame, and a strip of light inside each upright of it.
    g.strokeStyle = 'rgba(255, 206, 96, 0.8)';
    g.lineWidth = 0.5;
    g.strokeRect(depth + 0.9, 2.2, panel - 1.8, height - 4.4);
    g.fillStyle = 'rgba(255, 150, 215, 0.75)';
    g.fillRect(depth + 1.7, 3.4, 0.45, height - 6.8);
    g.fillStyle = 'rgba(125, 240, 255, 0.7)';
    g.fillRect(depth + panel - 2.15, 3.4, 0.45, height - 6.8);
    // A diamond of lamps in the middle of the panel, and one above and below it.
    g.fillStyle = 'rgba(255, 243, 168, 0.9)';
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

/** The front of the table, down to the tray: arrows pointing the way the winnings go. */
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
  for (let x = 14; x < W; x += 12) {
    g.beginPath();
    g.moveTo(x - 3.2, 7.5);
    g.lineTo(x, 13);
    g.lineTo(x + 3.2, 7.5);
    g.stroke();
  }
  return canvas;
}

/** The sign that rides over each gate. */
export function paintSign(): HTMLCanvasElement {
  const { canvas, g } = sheet(SIGN.width, SIGN.height, 24);
  if (!g) return canvas;
  g.fillStyle = '#1b0c4a';
  g.fillRect(0, 0, SIGN.width, SIGN.height);
  g.strokeStyle = '#7df0ff';
  g.lineWidth = 0.22;
  g.strokeRect(0.25, 0.25, SIGN.width - 0.5, SIGN.height - 0.5);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 2.5px "Arial Black", Arial, sans-serif';
  g.fillStyle = '#fff3a8';
  g.fillText('START', SIGN.width / 2, SIGN.height / 2 + 0.12);
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

/** The corners of the star on a medal's face, as shares of the medal's radius. */
const STAR = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? 0.46 : 0.19;
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
});

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
 * border, a ring of beads inside it, a fine ring, and a star cut in facets.
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
