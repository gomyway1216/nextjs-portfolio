/**
 * What is printed on the cabinet, painted flat with a canvas and handed to
 * the 3D renderer as textures: the lower table with its lanes and lettering,
 * the back panel, the side walls, the top of the pusher, the front of the
 * table and the sign over a gate. And one thing that is not paint: the relief
 * struck into a medal's face.
 */

import { FIELD, PUSHER } from './engine';
import { GATE, starPath } from './render';
import { HEIGHT } from './view';

const TAU = Math.PI * 2;
const W = FIELD.width;
const D = FIELD.depth;
const P = HEIGHT.pusher;

/** How high the back panel stands, and how far down the front of the table goes. */
export const PANEL_TOP = HEIGHT.wall + 2;
export const TRAY_DROP = 18;
/** The sign over a gate: how wide and how tall, in field units. */
export const SIGN = { width: 12, height: 3.4 } as const;

/** Where each pin of the back panel is: staggered rows above the gates. */
export function pinSpots(): { x: number; height: number }[] {
  const spots: { x: number; height: number }[] = [];
  for (let row = 0; row < 5; row++) {
    const height = P + GATE.height + 5 + row * 4.1;
    for (let x = row % 2 === 0 ? 5 : 8.75; x < W; x += 7.5) spots.push({ x, height });
  }
  return spots;
}

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

/** The back panel from the front: its top edge is the top of the picture. */
export function paintPanel(): HTMLCanvasElement {
  const { canvas, g } = sheet(W, PANEL_TOP, 10.24);
  if (!g) return canvas;
  const shade = g.createLinearGradient(0, 0, 0, PANEL_TOP);
  shade.addColorStop(0, '#5a2ab8');
  shade.addColorStop(0.6, '#33177c');
  shade.addColorStop(1, '#1e0d52');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, PANEL_TOP);
  // A sunburst from the top, behind the pins.
  for (let i = 0; i < 18; i++) {
    const from = Math.PI * (i / 18);
    g.fillStyle = i % 2 === 0 ? 'rgba(255, 120, 200, 0.09)' : 'rgba(120, 220, 255, 0.07)';
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.arc(W / 2, 0, 90, from, from + Math.PI / 18);
    g.closePath();
    g.fill();
  }
  // The pins themselves stand out of the panel; here is only the dark each one leaves under it.
  for (const pin of pinSpots()) {
    const dark = g.createRadialGradient(pin.x + 0.2, PANEL_TOP - pin.height + 0.45, 0.1, pin.x + 0.2, PANEL_TOP - pin.height + 0.45, 1.1);
    dark.addColorStop(0, 'rgba(8, 2, 30, 0.75)');
    dark.addColorStop(1, 'rgba(8, 2, 30, 0)');
    g.fillStyle = dark;
    g.fillRect(pin.x - 1.2, PANEL_TOP - pin.height - 0.9, 2.8, 2.8);
  }
  return canvas;
}

/** A side wall above its rail, from inside: the back of the cabinet is on the left, the top at the top. */
export function paintWall(): HTMLCanvasElement {
  const length = FIELD.sideOpenFrom;
  const height = HEIGHT.wall - HEIGHT.sideWall;
  const { canvas, g } = sheet(length, height, 6.5);
  if (!g) return canvas;
  const shade = g.createLinearGradient(0, 0, length, 0);
  shade.addColorStop(0, '#2c1b6c');
  shade.addColorStop(1, '#130a36');
  g.fillStyle = shade;
  g.fillRect(0, 0, length, height);
  const lift = g.createLinearGradient(0, 0, 0, height);
  lift.addColorStop(0, 'rgba(160, 130, 255, 0.16)');
  lift.addColorStop(1, 'rgba(0, 0, 20, 0.2)');
  g.fillStyle = lift;
  g.fillRect(0, 0, length, height);
  // Mirror panels: a dark seam and the bright edge of the next panel.
  for (let depth = 10; depth < length; depth += 12) {
    g.fillStyle = 'rgba(4, 0, 20, 0.5)';
    g.fillRect(depth - 0.22, 0, 0.22, height);
    g.fillStyle = 'rgba(200, 180, 255, 0.22)';
    g.fillRect(depth, 0, 0.18, height);
  }
  return canvas;
}

/** The top of the pusher from above. The top of the picture is its front lip, which the grooves and chevrons travel with. */
export function paintPusher(): HTMLCanvasElement {
  const { canvas, g } = sheet(W, PUSHER.max, 10.24);
  if (!g) return canvas;
  const steel = g.createLinearGradient(0, 0, 0, PUSHER.max);
  steel.addColorStop(0, '#f2f4fa');
  steel.addColorStop(0.3, '#cfd5e4');
  steel.addColorStop(1, '#7c86a3');
  g.fillStyle = steel;
  g.fillRect(0, 0, W, PUSHER.max);
  // Brushed across: fine streaks, light and dark, each at a place fixed by its number.
  for (let i = 0; i < 900; i++) {
    const y = ((i * 0.6180339) % 1) * PUSHER.max;
    const x = ((i * 0.3819661 * 7) % 1) * W;
    g.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(30, 40, 80, 0.06)';
    g.fillRect(x, y, 12 + (i % 23), 0.07);
  }
  // Grooves cut across it, and chevrons along the lip.
  for (let back = 9; back < PUSHER.max; back += 9) {
    g.fillStyle = 'rgba(30, 40, 76, 0.42)';
    g.fillRect(0, back, W, 0.28);
    g.fillStyle = 'rgba(255, 255, 255, 0.5)';
    g.fillRect(0, back + 0.28, W, 0.14);
  }
  g.fillStyle = 'rgba(255, 184, 28, 0.78)';
  for (let x = 4; x < W; x += 8) {
    g.beginPath();
    g.moveTo(x, 0.3);
    g.lineTo(x + 4, 0.3);
    g.lineTo(x + 2, 2.6);
    g.lineTo(x - 2, 2.6);
    g.closePath();
    g.fill();
  }
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
