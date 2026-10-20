/**
 * The cabinet's pictures, drawn with the canvas: the field and the cabinet round it, the carousel's skirt and its
 * deck, the pole with the treasure dish, the rail, and the medals. Each is drawn on a layer of its own (Stage.tsx), so
 * that the carousel can be turned without drawing anything again, and the medals drawn without the cabinet.
 *
 * Every function takes the stage's scale, `s`, in device pixels a medal radius, and draws in device pixels.
 */

import { AXIS, CAROUSEL, FIELD, MEDAL_RADIUS, POCKET, POCKETS, PRESS_TO_DECK, RING, WALLS, frontPays, type Machine } from './engine';
import { DEPTH_SQUASH as K, HEIGHTS, HEIGHT_SQUASH as H, RAIL, VIEW, project, type AirMedal } from './view';

type Ctx = CanvasRenderingContext2D;

/** The colours of the cabinet, fixed whatever the page's theme: a cabinet is lit the same in any room. */
export const LOOK = {
  night: '#140a1e',
  felt: '#3d2550',
  feltLight: '#56346b',
  wall: '#d9dde4',
  wallDark: '#7c8390',
  led: '#ff7fb0',
  gold: '#e8b84a',
  goldDark: '#8a6416',
  skirt: '#b8325a',
  skirtDark: '#6e1533',
  deck: '#f7d5e1',
  deckEdge: '#e58aa8',
  petal: '#fbe9ef',
  hole: '#1c0b14',
  lamp: '#ffd34d',
  silver: '#dfe3e8',
  silverMid: '#b4bac3',
  silverDark: '#737a85',
} as const;

const W = FIELD.width;
/** Where the side walls meet the front edge (the field's front corners). */
const FRONT_HALF = W / 2;

const at = (s: number, x: number, y: number, z = 0) => {
  const p = project(x, y, z);
  return { x: p.x * s, y: p.y * s };
};

/** A point along a side wall, `d` out from the pole. */
const wallPoint = (side: 0 | 1, d: number) => {
  const deg = WALLS[side].deg;
  const rad = (deg * Math.PI) / 180;
  return { x: AXIS.x + d * Math.cos(rad), y: AXIS.y + d * Math.sin(rad) };
};
/** How far out from the pole a side wall meets the front edge. */
const WALL_LENGTH = (FIELD.depth - AXIS.y) / Math.sin(((90 - FIELD.spread) * Math.PI) / 180);

/** The cabinet round the field, the field itself, its side walls, side holes and front edge: drawn once a size. */
export function drawCabinet(ctx: Ctx, s: number): void {
  const width = VIEW.width * s;
  const height = VIEW.height * s;
  ctx.clearRect(0, 0, width, height);
  // The cabinet's inside: a night sky behind the carousel, lit from below.
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#24123a');
  sky.addColorStop(0.45, LOOK.night);
  sky.addColorStop(1, '#0b0610');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  // Stars and lanterns on the back wall, behind the carousel.
  for (let i = 0; i < 28; i++) {
    const x = ((i * 97) % 100) / 100;
    const y = ((i * 53) % 37) / 100;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255, 196, 220, 0.75)' : 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x * width, y * height, (i % 3 === 0 ? 1.4 : 0.9) * (s / 10), 0, Math.PI * 2);
    ctx.fill();
  }
  // The stage the carousel stands on: a round of gold at the back.
  const base = at(s, AXIS.x, AXIS.y, 0);
  ctx.fillStyle = '#2c1838';
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, (CAROUSEL.radius + CAROUSEL.offset + 0.8) * s, (CAROUSEL.radius + CAROUSEL.offset + 0.8) * K * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // The field: a fan of felt between the side walls, from the pole to the front edge.
  const leftFront = wallPoint(1, WALL_LENGTH);
  const rightFront = wallPoint(0, WALL_LENGTH);
  const apex = at(s, AXIS.x, AXIS.y);
  const lf = at(s, leftFront.x, leftFront.y);
  const rf = at(s, rightFront.x, rightFront.y);
  const felt = ctx.createLinearGradient(0, apex.y, 0, lf.y);
  felt.addColorStop(0, LOOK.feltLight);
  felt.addColorStop(1, LOOK.felt);
  ctx.fillStyle = felt;
  ctx.beginPath();
  ctx.moveTo(apex.x, apex.y);
  ctx.lineTo(rf.x, rf.y);
  ctx.lineTo(lf.x, lf.y);
  ctx.closePath();
  ctx.fill();
  // Rays out from the pole, pressed into the felt.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = Math.max(1, s * 0.08);
  for (let deg = 90 - FIELD.spread + 6; deg < 90 + FIELD.spread; deg += 6) {
    const rad = (deg * Math.PI) / 180;
    const end = at(s, AXIS.x + WALL_LENGTH * Math.cos(rad), Math.min(FIELD.depth, AXIS.y + WALL_LENGTH * Math.sin(rad)));
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  // The front edge: its face below the field, gold over the tray and dark over the side holes at the corners.
  const lip = 1.1;
  for (let x = 0; x < W; x += 0.25) {
    const pays = frontPays(x + 0.125);
    const a = at(s, x, FIELD.depth);
    const b = at(s, x + 0.25, FIELD.depth, -lip);
    ctx.fillStyle = pays ? LOOK.gold : '#20101c';
    ctx.fillRect(a.x, a.y, b.x - a.x + 0.5, b.y - a.y);
  }
  // The side holes: dark mouths at the front corners, where the side walls end.
  for (const side of [0, 1] as const) {
    const corner = side === 0 ? rightFront : leftFront;
    const inner = side === 0 ? corner.x - FIELD.sideReach : corner.x + FIELD.sideReach;
    const p0 = at(s, Math.min(corner.x, inner), FIELD.depth - 0.4);
    const p1 = at(s, Math.max(corner.x, inner), FIELD.depth + 0.2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  }

  // The side walls: chrome rails along the fan's edges, a row of pink lamps along each.
  for (const side of [0, 1] as const) {
    const from = wallPoint(side, CAROUSEL.radius + CAROUSEL.offset - 0.5);
    const to = side === 0 ? rightFront : leftFront;
    const outward = side === 0 ? 1 : -1;
    const top0 = at(s, from.x + outward * 0.3, from.y, 1.6);
    const top1 = at(s, to.x + outward * 0.3, to.y, 1.6);
    const foot0 = at(s, from.x, from.y, 0);
    const foot1 = at(s, to.x, to.y, 0);
    const chrome = ctx.createLinearGradient(top0.x, top0.y, foot0.x, foot0.y);
    chrome.addColorStop(0, LOOK.wall);
    chrome.addColorStop(1, LOOK.wallDark);
    ctx.fillStyle = chrome;
    ctx.beginPath();
    ctx.moveTo(top0.x, top0.y);
    ctx.lineTo(top1.x, top1.y);
    ctx.lineTo(foot1.x, foot1.y);
    ctx.lineTo(foot0.x, foot0.y);
    ctx.closePath();
    ctx.fill();
    for (let k = 0.06; k < 1; k += 0.11) {
      const p = { x: top0.x + (top1.x - top0.x) * k, y: top0.y + (top1.y - top0.y) * k };
      ctx.fillStyle = LOOK.led;
      ctx.beginPath();
      ctx.arc(p.x, p.y + s * 0.35, Math.max(1.2, s * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The carousel's skirt: a round wall `CAROUSEL.height` high, drawn about the middle of its top (`skirtBox`). */
export function skirtBox(s: number): { width: number; height: number; cx: number; cy: number } {
  const r = CAROUSEL.radius * s;
  const margin = 2;
  return { width: Math.ceil(2 * r + 2 * margin), height: Math.ceil(2 * r * K + CAROUSEL.height * H * s + 2 * margin), cx: r + margin, cy: r * K + margin };
}
export function drawSkirt(ctx: Ctx, s: number): void {
  const box = skirtBox(s);
  ctx.clearRect(0, 0, box.width, box.height);
  const r = CAROUSEL.radius * s;
  const ry = r * K;
  const drop = CAROUSEL.height * H * s;
  const side = ctx.createLinearGradient(box.cx - r, 0, box.cx + r, 0);
  side.addColorStop(0, LOOK.skirtDark);
  side.addColorStop(0.35, LOOK.skirt);
  side.addColorStop(0.55, '#d8577d');
  side.addColorStop(1, LOOK.skirtDark);
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.ellipse(box.cx, box.cy + drop, r, ry, 0, 0, Math.PI);
  ctx.lineTo(box.cx - r, box.cy);
  ctx.ellipse(box.cx, box.cy, r, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  // Gold bands round the skirt, under the deck and at its foot.
  for (const [z, w] of [
    [0.06, 0.16],
    [0.55, 0.08],
    [0.97, 0.12],
  ] as const) {
    ctx.strokeStyle = LOOK.gold;
    ctx.lineWidth = Math.max(1, w * s);
    ctx.beginPath();
    ctx.ellipse(box.cx, box.cy + drop * z, r - ctx.lineWidth / 2, ry - ctx.lineWidth / 2, 0, 0, Math.PI);
    ctx.stroke();
  }
}

/** The deck, seen from straight above (the stage squashes and turns it): `deckBox` gives its size; the pole is its middle. */
export function deckBox(s: number): { size: number; c: number } {
  const half = (CAROUSEL.radius + CAROUSEL.offset + 0.4) * s;
  return { size: Math.ceil(2 * half), c: half };
}
export function drawDeck(ctx: Ctx, s: number): void {
  const { size, c } = deckBox(s);
  ctx.clearRect(0, 0, size, size);
  const cx = c + CAROUSEL.offset * s;
  const cy = c;
  const r = CAROUSEL.radius * s;
  // The deck: blossom pink, its edge a little darker, a ring of bulbs round it.
  const deck = ctx.createRadialGradient(c, c, s, cx, cy, r);
  deck.addColorStop(0, '#fff2f6');
  deck.addColorStop(0.7, LOOK.deck);
  deck.addColorStop(1, LOOK.deckEdge);
  ctx.fillStyle = deck;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LOOK.gold;
  ctx.lineWidth = Math.max(1.5, s * 0.22);
  ctx.beginPath();
  ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? '#fff6c8' : '#ffd0e0';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (r - s * 0.55), cy + Math.sin(a) * (r - s * 0.55), Math.max(1, s * 0.17), 0, Math.PI * 2);
    ctx.fill();
  }
  // Blossoms scattered on the deck, five petals each.
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996;
    const d = (0.25 + ((i * 37) % 10) / 16) * (r - 1.6 * s);
    drawBlossom(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, s * 0.5, a);
  }
  // The ring the holes ride round on, and the holes: dark mouths a little wider than a medal, gold rims, a lamp each.
  ctx.strokeStyle = 'rgba(184, 50, 90, 0.35)';
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.setLineDash([s * 0.4, s * 0.3]);
  ctx.beginPath();
  ctx.arc(c, c, RING * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const deg of POCKETS) {
    const a = (deg * Math.PI) / 180;
    const hx = c + Math.cos(a) * RING * s;
    const hy = c + Math.sin(a) * RING * s;
    ctx.fillStyle = LOOK.goldDark;
    ctx.beginPath();
    ctx.arc(hx, hy, (POCKET.mouth + 0.32) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LOOK.gold;
    ctx.beginPath();
    ctx.arc(hx, hy, (POCKET.mouth + 0.2) * s, 0, Math.PI * 2);
    ctx.fill();
    const hole = ctx.createRadialGradient(hx, hy - s * 0.3, s * 0.1, hx, hy, POCKET.mouth * s);
    hole.addColorStop(0, '#000');
    hole.addColorStop(1, LOOK.hole);
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(hx, hy, POCKET.mouth * s, 0, Math.PI * 2);
    ctx.fill();
    // Its lamp, just outside it on the ring.
    const la = a + 0.62;
    ctx.fillStyle = LOOK.lamp;
    ctx.beginPath();
    ctx.arc(c + Math.cos(la) * RING * s, c + Math.sin(la) * RING * s, Math.max(1.5, s * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Where the pole comes up through the deck.
  ctx.fillStyle = LOOK.goldDark;
  ctx.beginPath();
  ctx.arc(c, c, s * 0.95, 0, Math.PI * 2);
  ctx.fill();
}

function drawBlossom(ctx: Ctx, x: number, y: number, size: number, turn: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.fillStyle = LOOK.petal;
  for (let p = 0; p < 5; p++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.55, size * 0.36, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f08fae';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** How many medals of the stock the dish shows piled in it: more as it grows, up to a full dish. */
export const heapShown = (stock: number): number => Math.min(48, 6 + Math.round(Math.sqrt(stock) * 2.2));

/** The pole and the treasure dish on top of it, its stock piled in it. Drawn again when the stock changes. */
export function drawPole(ctx: Ctx, s: number, stock: number): void {
  const foot = at(s, AXIS.x, AXIS.y, HEIGHTS.deck);
  const top = at(s, AXIS.x, AXIS.y, HEIGHTS.dish);
  const w = s * 0.7;
  const pole = ctx.createLinearGradient(foot.x - w, 0, foot.x + w, 0);
  pole.addColorStop(0, LOOK.goldDark);
  pole.addColorStop(0.45, '#ffe7a0');
  pole.addColorStop(1, LOOK.goldDark);
  ctx.fillStyle = pole;
  ctx.fillRect(foot.x - w, top.y, 2 * w, foot.y - top.y);
  // A red ribbon wound round the pole.
  ctx.strokeStyle = '#d0335c';
  ctx.lineWidth = Math.max(1, s * 0.22);
  for (let y = top.y + s * 0.4; y < foot.y; y += s * 0.9) {
    ctx.beginPath();
    ctx.moveTo(foot.x - w, y + s * 0.35);
    ctx.lineTo(foot.x + w, y);
    ctx.stroke();
  }
  // The dish.
  const dr = 2.3 * s;
  ctx.fillStyle = LOOK.goldDark;
  ctx.beginPath();
  ctx.ellipse(top.x, top.y + s * 0.35, dr, dr * K, 0, 0, Math.PI * 2);
  ctx.fill();
  const rim = ctx.createLinearGradient(top.x - dr, 0, top.x + dr, 0);
  rim.addColorStop(0, '#b8862a');
  rim.addColorStop(0.5, '#ffe9a8');
  rim.addColorStop(1, '#b8862a');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, dr, dr * K, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3c08';
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, dr * 0.84, dr * K * 0.84, 0, 0, Math.PI * 2);
  ctx.fill();
  // The stock, a heap of medals in the dish.
  const sprite = medalSprite(s, 0);
  const n = heapShown(stock);
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(Math.sqrt(i));
    const a = i * 2.39996;
    const d = Math.max(0, 1.5 - layer * 0.3) * ((i % 5) / 5 + 0.2) * s;
    const x = top.x + Math.cos(a) * d;
    const y = top.y + Math.sin(a) * d * K - layer * s * 0.35;
    ctx.drawImage(sprite.canvas, x - sprite.cx, y - sprite.cy);
  }
}

/**
 * The mark a player times a medal by: a gold pointer over the ring of holes, where a hole is at the moment to press
 * (it reaches the drop spot as the medal comes down).
 */
export function drawMark(ctx: Ctx, s: number): void {
  const rad = ((90 - PRESS_TO_DECK) * Math.PI) / 180;
  const p = at(s, AXIS.x + RING * Math.cos(rad), AXIS.y + RING * Math.sin(rad), HEIGHTS.deck + 2.1);
  const w = s * 0.75;
  ctx.fillStyle = LOOK.lamp;
  ctx.strokeStyle = '#5a3c08';
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.beginPath();
  ctx.moveTo(p.x - w, p.y - w * 1.1);
  ctx.lineTo(p.x + w, p.y - w * 1.1);
  ctx.lineTo(p.x, p.y + w * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** The rail: a chrome trough from the slot at the back on the left down to its tip over the drop spot. */
export function drawRail(ctx: Ctx, s: number): void {
  const a = at(s, RAIL.from.x, RAIL.from.y, RAIL.from.z);
  const b = at(s, RAIL.to.x, RAIL.to.y, RAIL.to.z);
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  const n = Math.hypot(nx, ny) || 1;
  const w = s * 0.55;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.moveTo(a.x + (nx / n) * w, a.y + (ny / n) * w + s);
  ctx.lineTo(b.x + (nx / n) * w, b.y + (ny / n) * w + s);
  ctx.lineTo(b.x - (nx / n) * w, b.y - (ny / n) * w + s);
  ctx.lineTo(a.x - (nx / n) * w, a.y - (ny / n) * w + s);
  ctx.fill();
  const chrome = ctx.createLinearGradient(a.x + (nx / n) * w, a.y + (ny / n) * w, a.x - (nx / n) * w, a.y - (ny / n) * w);
  chrome.addColorStop(0, '#f4f6f9');
  chrome.addColorStop(0.5, '#8d95a1');
  chrome.addColorStop(1, '#e3e7ec');
  ctx.strokeStyle = chrome;
  ctx.lineWidth = 2 * w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  // The slot at its top, where the player's medal goes in.
  ctx.fillStyle = LOOK.gold;
  ctx.beginPath();
  ctx.arc(a.x, a.y, s * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b0d12';
  ctx.fillRect(a.x - s * 0.15, a.y - s * 0.85, s * 0.3, s * 1.7);
}

// ── Medals ───────────────────────────────────────────────────────────────────

interface Sprite {
  canvas: HTMLCanvasElement;
  cx: number;
  cy: number;
}
const sprites = new Map<string, Sprite>();

/** A medal lying flat, as the stage sees it, in one of a few shades (a medal's own wear). */
export function medalSprite(s: number, shade: number): Sprite {
  const key = `${s.toFixed(3)}:${shade}`;
  const kept = sprites.get(key);
  if (kept) return kept;
  if (sprites.size > 24) sprites.clear();
  const r = MEDAL_RADIUS * s;
  const ry = r * K;
  const thick = Math.max(1, 0.14 * H * s);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(2 * r + 4);
  canvas.height = Math.ceil(2 * ry + thick + 4);
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = ry + 2;
  if (ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + thick + 0.6, r, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LOOK.silverDark;
    ctx.beginPath();
    ctx.ellipse(cx, cy + thick, r, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    const lift = [0, 12, -10, 6][shade % 4];
    const face = ctx.createRadialGradient(cx - r * 0.35, cy - ry * 0.4, r * 0.1, cx, cy, r);
    face.addColorStop(0, `rgb(${248 + Math.min(7, lift)}, ${249 + Math.min(6, lift)}, ${252})`);
    face.addColorStop(0.55, `rgb(${185 + lift}, ${190 + lift}, ${198 + lift})`);
    face.addColorStop(1, `rgb(${128 + lift}, ${134 + lift}, ${143 + lift})`);
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 96, 106, 0.8)';
    ctx.lineWidth = Math.max(0.6, s * 0.06);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const sprite = { canvas, cx, cy };
  sprites.set(key, sprite);
  return sprite;
}

/** The field's medals, back to front. */
export function drawField(ctx: Ctx, s: number, m: Pick<Machine, 'xy' | 'grow' | 'ids'>): void {
  const n = m.ids.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => m.xy[2 * a + 1] - m.xy[2 * b + 1]);
  for (const i of order) {
    const p = at(s, m.xy[2 * i], m.xy[2 * i + 1]);
    const sprite = medalSprite(s, m.ids[i] % 4);
    const g = m.grow[i];
    if (g >= 0.999) ctx.drawImage(sprite.canvas, p.x - sprite.cx, p.y - sprite.cy);
    else {
      // A medal still settling in is drawn a little above the others, as one that has just come down on them.
      ctx.drawImage(sprite.canvas, p.x - sprite.cx, p.y - sprite.cy - (1 - g) * s * 0.6);
    }
  }
}

/** Medals in the air, back to front: on the rail on their edges, falling, sliding, thrown. */
export function drawAir(ctx: Ctx, s: number, medals: readonly AirMedal[]): void {
  const sorted = [...medals].sort((a, b) => a.y - b.y || a.z - b.z);
  for (const medal of sorted) {
    const p = at(s, medal.x, medal.y, medal.z);
    const r = MEDAL_RADIUS * s * medal.size;
    if (medal.edge <= 0.02) {
      const sprite = medalSprite(s, medal.id % 4);
      if (medal.size >= 0.999) ctx.drawImage(sprite.canvas, p.x - sprite.cx, p.y - sprite.cy);
      else ctx.drawImage(sprite.canvas, p.x - sprite.cx * medal.size, p.y - sprite.cy * medal.size, sprite.canvas.width * medal.size, sprite.canvas.height * medal.size);
      continue;
    }
    // Turned up towards its edge: drawn as a narrower ellipse standing up.
    const ry = r * (K + (1 - K) * medal.edge);
    const rx = r * (1 - 0.55 * medal.edge);
    const face = ctx.createLinearGradient(p.x - rx, p.y - ry, p.x + rx, p.y + ry);
    face.addColorStop(0, '#f6f7f9');
    face.addColorStop(1, LOOK.silverDark);
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = LOOK.silverDark;
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.stroke();
  }
}

export { FRONT_HALF };
