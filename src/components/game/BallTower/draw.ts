/**
 * The ball tower painted on its canvas: the night, the glass tower and its lift (painted once for each size the board
 * is drawn at, and kept), and over them, each frame, the five discs as they turn, the pockets' words, the stage lamps
 * up the side, a lit roulette, the ball, and the fireworks of a jackpot.
 *
 * Each disc's face is painted once, flat (a circle of its pockets, `discFace`), and drawn each frame turned and
 * squashed to the slant it is seen at: one image a disc. The pockets' words are written upright over it, on the side
 * that faces the player, so that they can be read however far the disc has turned.
 *
 * Only the canvas's 2D context is used; what is painted where comes from scene.ts.
 */

import { DISCS, LAMP_SETS, LEVELS, POCKETS, type PocketKind } from './engine';
import { BALL_R, BOARD_H, BOARD_W, DISC_PLACES, LADDER_X, LIFT, RING_IN, TRACK, onDisc, pocketAngle, pocketLabel, pocketWidth, type BallPose } from './scene';

/** A canvas this painter can paint on and keep: the page's own, or one made for it. */
export type Paper = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Each disc's colour: a festival's paper lanterns, top to bottom. */
export const DISC_COLOURS: readonly { face: string; deep: string; edge: string }[] = [
  { face: '#3b4fb8', deep: '#1f2a72', edge: '#7f8ff0' },
  { face: '#178a8a', deep: '#0b4c52', edge: '#5fd3c9' },
  { face: '#7b3fb6', deep: '#3f1d66', edge: '#c08af0' },
  { face: '#b8323f', deep: '#64131d', edge: '#f08a8f' },
  { face: '#c58a12', deep: '#6a4405', edge: '#ffd66b' },
];

/** What each kind of pocket is painted in, and its words. */
const POCKET_PAINT: Readonly<Record<PocketKind | 'chance', { fill: string; ink: string }>> = {
  up: { fill: '#ffd34d', ink: '#3a2600' },
  chance: { fill: '#ff4d5e', ink: '#ffffff' },
  out: { fill: '#161a2e', ink: '#8a93b8' },
  pay: { fill: '', ink: '#ffffff' },
  mystery: { fill: '#d23ee0', ink: '#ffffff' },
  jackpot: { fill: '#fff1a8', ink: '#b3121f' },
};

const paintOf = (level: number, pocket: number) => {
  const kind = DISCS[level][pocket].kind;
  return kind === 'up' && level >= 2 ? POCKET_PAINT.chance : POCKET_PAINT[kind];
};

/** A canvas to paint on and keep, `w` × `h` pixels. */
function paper(w: number, h: number): Paper {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
const contextOf = (p: Paper): Ctx => p.getContext('2d') as Ctx;

// ── The night, the tower and the lift: painted once a size ────────────────

/** The board's still parts, at `k` pixels a unit. */
export function paintBackdrop(k: number): Paper {
  const p = paper(Math.round(BOARD_W * k), Math.round(BOARD_H * k));
  const ctx = contextOf(p);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  // The night over the festival.
  const sky = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  sky.addColorStop(0, '#070a24');
  sky.addColorStop(0.55, '#12184a');
  sky.addColorStop(1, '#2a1640');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  // Stars, the same every time.
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (let i = 0; i < 46; i++) {
    const x = next() * BOARD_W;
    const y = next() * BOARD_H * 0.9;
    const s = 0.4 + next() * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  // The glass tower: a tall cylinder of glass round the discs, its back wall faint.
  const glass = ctx.createLinearGradient(30, 0, 334, 0);
  glass.addColorStop(0, 'rgba(140, 200, 255, 0.10)');
  glass.addColorStop(0.5, 'rgba(140, 200, 255, 0.03)');
  glass.addColorStop(1, 'rgba(140, 200, 255, 0.12)');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(98, 30);
  ctx.lineTo(266, 30);
  ctx.lineTo(332, 492);
  ctx.lineTo(32, 492);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(170, 220, 255, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // The tower's crown: a ring of brass over the top disc.
  ctx.fillStyle = '#b8862e';
  ctx.beginPath();
  ctx.ellipse(182, 30, 86, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd77a';
  ctx.beginPath();
  ctx.ellipse(182, 28, 86, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3a0a';
  ctx.font = '800 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★ ★ ★', 182, 28.5);
  // Each disc's shadow on the glass and the spindle down the middle.
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(182, 36);
  ctx.lineTo(182, DISC_PLACES[LEVELS - 1].cy);
  ctx.stroke();
  // The lift up the right side: a glass tube from the launcher to the top, and the chute over to the top disc.
  ctx.strokeStyle = 'rgba(190, 230, 255, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.fillStyle = 'rgba(160, 210, 255, 0.10)';
  ctx.beginPath();
  ctx.roundRect(LIFT.x - 9, LIFT.top - 9, 18, LIFT.bottom - LIFT.top + 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(LIFT.x - 6, LIFT.top - 6);
  ctx.quadraticCurveTo(LIFT.x - 50, LIFT.top - 12, 250, 52);
  ctx.stroke();
  // The launcher at the foot of the lift, where a seat's ball goes in.
  ctx.fillStyle = '#2c3358';
  ctx.beginPath();
  ctx.roundRect(LIFT.x - 14, LIFT.bottom + 2, 28, 14, 4);
  ctx.fill();
  ctx.fillStyle = '#ffcf4a';
  ctx.fillRect(LIFT.x - 8, LIFT.bottom + 6, 16, 3);
  // The stage lamps' plate up the left side.
  ctx.fillStyle = 'rgba(10, 12, 34, 0.75)';
  ctx.strokeStyle = 'rgba(255, 210, 120, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(LADDER_X - 13, DISC_PLACES[0].cy - 18, 26, DISC_PLACES[LEVELS - 1].cy - DISC_PLACES[0].cy + 36, 10);
  ctx.fill();
  ctx.stroke();
  return p;
}

// ── A disc's face: painted once, flat, and turned and squashed each frame ──

/** Disc `level`'s face, flat: its ring of pockets, its middle, and its hub, at `k` pixels a unit. */
export function discFace(level: number, k: number): Paper {
  const d = DISC_PLACES[level];
  const size = Math.ceil(d.r * 2 * k) + 4;
  const p = paper(size, size);
  const ctx = contextOf(p);
  ctx.setTransform(k, 0, 0, k, size / 2, size / 2);
  const colours = DISC_COLOURS[level];
  // The middle: the disc's colour, lighter towards the hub.
  const middle = ctx.createRadialGradient(0, 0, d.r * 0.05, 0, 0, d.r);
  middle.addColorStop(0, colours.edge);
  middle.addColorStop(0.55, colours.face);
  middle.addColorStop(1, colours.deep);
  ctx.fillStyle = middle;
  ctx.beginPath();
  ctx.arc(0, 0, d.r, 0, Math.PI * 2);
  ctx.fill();
  // The ring of pockets.
  const half = pocketWidth(level) / 2;
  for (let pocket = 0; pocket < POCKETS[level]; pocket++) {
    const mid = pocketAngle(level, pocket);
    const paint = paintOf(level, pocket);
    ctx.fillStyle = paint.fill || (pocket % 2 === 0 ? colours.face : colours.deep);
    ctx.beginPath();
    ctx.arc(0, 0, d.r * 0.985, mid - half, mid + half);
    ctx.arc(0, 0, d.r * RING_IN, mid + half, mid - half, true);
    ctx.closePath();
    ctx.fill();
  }
  // The walls between the pockets, and the ring's two edges.
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.85)';
  ctx.lineWidth = level === 0 ? 1.4 : 1.8;
  for (let pocket = 0; pocket < POCKETS[level]; pocket++) {
    const a = pocketAngle(level, pocket) - half;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * d.r * RING_IN, Math.sin(a) * d.r * RING_IN);
    ctx.lineTo(Math.cos(a) * d.r, Math.sin(a) * d.r);
    ctx.stroke();
  }
  ctx.lineWidth = 2.2;
  for (const rho of [RING_IN, 0.985]) {
    ctx.beginPath();
    ctx.arc(0, 0, d.r * rho, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The hub, a brass cap.
  const hub = ctx.createRadialGradient(-d.r * 0.04, -d.r * 0.04, 1, 0, 0, d.r * 0.16);
  hub.addColorStop(0, '#fff3c4');
  hub.addColorStop(1, '#a8741c');
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(0, 0, d.r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  return p;
}

/** The ball: a steel ball with the lamps in it, at `k` pixels a unit. */
export function ballSprite(k: number): Paper {
  const size = Math.ceil(BALL_R * 2 * k * 1.25) + 2;
  const p = paper(size, size);
  const ctx = contextOf(p);
  ctx.setTransform(k, 0, 0, k, size / 2, size / 2);
  const steel = ctx.createRadialGradient(-BALL_R * 0.35, -BALL_R * 0.4, BALL_R * 0.1, 0, 0, BALL_R);
  steel.addColorStop(0, '#ffffff');
  steel.addColorStop(0.35, '#e3e8f2');
  steel.addColorStop(0.75, '#8d97ad');
  steel.addColorStop(1, '#4b5368');
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  return p;
}

/** Everything painted once for a size, kept until the board is drawn at another. */
export interface Sprites {
  k: number;
  backdrop: Paper;
  faces: Paper[];
  /** The pockets' words, each written once at each size it is shown at (writing text is the dearest thing a frame does). */
  words: Map<string, Paper>;
  ball: Paper;
}

export function spritesFor(k: number): Sprites {
  return { k, backdrop: paintBackdrop(k), faces: Array.from({ length: LEVELS }, (_, level) => discFace(level, k)), ball: ballSprite(k), words: new Map() };
}

// ── A frame ─────────────────────────────────────────────────────────────────

/** What a frame shows. */
export interface Frame {
  /** Where each disc stands, in radians. */
  angles: readonly number[];
  ball: BallPose;
  /** The stage lamps: the deepest disc reached (-1: none), and whether its lamp blinks on now. */
  level: number;
  blink: boolean;
  /** A pocket lit, where the ball has settled: its disc, the pocket, and how bright (0 to 1). */
  lit: { level: number; pocket: number; glow: number } | null;
  /** A roulette lit: its disc, the lamp lit, and whether it has stopped. */
  roulette: { level: number; lamp: number; stopped: boolean } | null;
  /** Fireworks: ms since the jackpot came in, or null. */
  fireworks: number | null;
}

/** A pocket's word in `ink` at `size` units, written once at `k` pixels a unit and kept. */
function wordSprite(sprites: Sprites, text: string, size: number, ink: string): Paper {
  const key = `${text}|${size}|${ink}`;
  const kept = sprites.words.get(key);
  if (kept) return kept;
  const k = sprites.k;
  const font = `900 ${size}px system-ui, sans-serif`;
  const measure = contextOf(paper(1, 1));
  measure.font = font;
  const w = Math.ceil((measure.measureText(text).width + 2) * k);
  const h = Math.ceil(size * 1.3 * k);
  const p = paper(Math.max(1, w), Math.max(1, h));
  const ctx = contextOf(p);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.fillText(text, w / k / 2, h / k / 2);
  sprites.words.set(key, p);
  return p;
}

/** Writes the words of the pockets of disc `level` turned to `angle` that face the player, upright. */
function pocketWords(ctx: Ctx, sprites: Sprites, level: number, angle: number): void {
  const d = DISC_PLACES[level];
  const size = level === 0 ? 7 : level === 1 ? 8.5 : level === 2 ? 11 : 12.5;
  for (let pocket = 0; pocket < POCKETS[level]; pocket++) {
    const kind = DISCS[level][pocket].kind;
    // The top disc's OUT pockets say nothing: dark is OUT.
    if (level === 0 && kind === 'out') continue;
    const a = angle + pocketAngle(level, pocket);
    const facing = Math.sin(a);
    if (facing < -0.55) continue;
    const { x, y } = onDisc(level, a, (RING_IN + 1) / 2);
    const near = 0.72 + 0.28 * ((facing + 1) / 2);
    const text = pocketLabel(level, pocket);
    const small = text.length > 3 ? 0.62 : text.length > 2 ? 0.85 : 1;
    // Sizes in steps of a quarter unit, so that each word is written at a handful of sizes and kept.
    const word = wordSprite(sprites, text, Math.round(size * near * small * 4) / 4, paintOf(level, pocket).ink);
    const w = word.width / sprites.k;
    const h = word.height / sprites.k;
    ctx.globalAlpha = facing < -0.1 ? 0.55 : 1;
    ctx.drawImage(word, x - w / 2, y + d.ry * 0.02 - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}

/** Draws disc `level` turned to `angle`: its wall, its face, and the light of a pocket lit on it. */
function paintDisc(ctx: Ctx, sprites: Sprites, level: number, angle: number, lit: Frame['lit']): void {
  const d = DISC_PLACES[level];
  // The wall: the front half of the disc's edge, below its face.
  ctx.fillStyle = DISC_COLOURS[level].deep;
  ctx.beginPath();
  ctx.ellipse(d.cx, d.cy + d.thick, d.r, d.ry, 0, 0, Math.PI);
  ctx.lineTo(d.cx - d.r, d.cy);
  ctx.ellipse(d.cx, d.cy, d.r, d.ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 230, 170, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(d.cx, d.cy + d.thick, d.r, d.ry, 0, 0, Math.PI);
  ctx.stroke();
  // The face, turned and squashed.
  ctx.save();
  ctx.translate(d.cx, d.cy);
  ctx.scale(1, d.ry / d.r);
  ctx.rotate(angle);
  const face = sprites.faces[level];
  const span = face.width / sprites.k;
  ctx.drawImage(face, -span / 2, -span / 2, span, span);
  if (lit && lit.level === level) {
    const mid = pocketAngle(level, lit.pocket);
    const half = pocketWidth(level) / 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255, 246, 200, ${(0.25 + 0.45 * lit.glow).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, d.r, mid - half, mid + half);
    ctx.arc(0, 0, d.r * RING_IN, mid + half, mid - half, true);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  pocketWords(ctx, sprites, level, angle);
}

/** A lit roulette over its disc's hub: its ring of lamps, and the multiple of the lamp lit. */
function paintRoulette(ctx: Ctx, roulette: NonNullable<Frame['roulette']>): void {
  const d = DISC_PLACES[roulette.level];
  const lamps = LAMP_SETS[roulette.level];
  const rx = d.r * 0.42;
  const ry = d.ry * 0.42 + 6;
  const cy = d.cy - 10;
  ctx.fillStyle = 'rgba(12, 6, 30, 0.82)';
  ctx.beginPath();
  ctx.ellipse(d.cx, cy, rx + 9, ry + 9, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < lamps.length; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / lamps.length;
    const on = i === roulette.lamp;
    ctx.fillStyle = on ? '#fff36b' : 'rgba(210, 62, 224, 0.55)';
    ctx.beginPath();
    ctx.arc(d.cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, on ? 4.2 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${roulette.stopped ? 19 : 16}px system-ui, sans-serif`;
  ctx.fillStyle = roulette.stopped ? '#fff36b' : '#ffffff';
  ctx.fillText(`×${lamps[roulette.lamp]}`, d.cx, cy + 1);
}

/** The stage lamps up the left side: one a disc, lit down to the deepest disc the ball has reached. */
function paintLadder(ctx: Ctx, level: number, blink: boolean): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < LEVELS; i++) {
    const y = DISC_PLACES[i].cy;
    const on = i < level || (i === level && blink);
    const special = i >= 3;
    ctx.fillStyle = on ? (special ? (i === 4 ? '#ffd34d' : '#ff4d5e') : '#7df0ff') : 'rgba(120, 130, 170, 0.35)';
    ctx.beginPath();
    ctx.arc(LADDER_X, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on ? '#10122a' : 'rgba(220, 225, 245, 0.75)';
    ctx.font = '900 9px system-ui, sans-serif';
    ctx.fillText(i === 4 ? 'JP' : String(i + 1), LADDER_X, y + 0.5);
  }
}

/** A jackpot's fireworks: shells bursting over the tower one after another, each a ring of stars falling as it fades. */
function paintFireworks(ctx: Ctx, ms: number): void {
  const bursts = [
    { at: 0, x: 110, y: 120, hue: 48 },
    { at: 380, x: 262, y: 92, hue: 350 },
    { at: 760, x: 182, y: 200, hue: 190 },
    { at: 1_150, x: 88, y: 250, hue: 300 },
    { at: 1_500, x: 282, y: 226, hue: 120 },
    { at: 1_900, x: 160, y: 96, hue: 28 },
    { at: 2_250, x: 236, y: 300, hue: 210 },
  ];
  ctx.globalCompositeOperation = 'lighter';
  for (const burst of bursts) {
    const t = (ms - burst.at) / 1000;
    if (t < 0 || t > 1.3) continue;
    const fade = Math.max(0, 1 - t / 1.3);
    // The flash of the shell, gone in a moment.
    if (t < 0.18) {
      ctx.fillStyle = `hsla(${burst.hue}, 100%, 85%, ${(0.7 * (1 - t / 0.18)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, 10 + 60 * t, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 28; i++) {
      const a = (Math.PI * 2 * i) / 28;
      const speed = 82 + (i % 3) * 20;
      const spread = 1 - Math.exp(-3.2 * t);
      const x = burst.x + (Math.cos(a) * speed * spread) / 1.6;
      const y = burst.y + (Math.sin(a) * speed * spread) / 1.6 + 26 * t * t;
      ctx.fillStyle = `hsla(${burst.hue + (i % 2) * 30}, 100%, 70%, ${fade.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.8 * fade + 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** The ball, where it is. */
function paintBall(ctx: Ctx, sprites: Sprites, ball: BallPose): void {
  if (ball.shown <= 0) return;
  const level = Math.max(0, ball.level);
  const near = 0.9 + 0.12 * (level / (LEVELS - 1));
  const size = (sprites.ball.width / sprites.k) * ball.scale * near;
  ctx.globalAlpha = ball.shown;
  ctx.drawImage(sprites.ball, ball.x - size / 2, ball.y - size / 2, size, size);
  ctx.globalAlpha = 1;
}

/** Paints the board's still parts on its own canvas, under the one each frame is painted on: once for each size. */
export function paintStill(ctx: CanvasRenderingContext2D, sprites: Sprites): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(sprites.backdrop, 0, 0);
}

/**
 * Paints a frame on `ctx` (a canvas `k` pixels a unit, over the still parts' own): the discs top to bottom, the ball (behind a
 * disc it is falling past from a pocket at the back), the roulette, the stage lamps and the fireworks.
 */
export function paintFrame(ctx: CanvasRenderingContext2D, sprites: Sprites, frame: Frame): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(sprites.k, 0, 0, sprites.k, 0, 0);
  const { ball } = frame;
  for (let level = 0; level < LEVELS; level++) paintDisc(ctx, sprites, level, frame.angles[level], frame.lit);
  paintBall(ctx, sprites, ball);
  // A ball falling from a pocket at the back of a disc passes behind the disc's front: that disc is painted over it again.
  if (ball.pocket === null && ball.level > 0 && ball.y < DISC_PLACES[ball.level - 1].cy + DISC_PLACES[ball.level - 1].ry + DISC_PLACES[ball.level - 1].thick) {
    const above = ball.level - 1;
    const d = DISC_PLACES[above];
    const dx = (ball.x - d.cx) / d.r;
    const front = d.cy + d.ry * Math.sqrt(Math.max(0, 1 - dx * dx));
    if (ball.y < front + d.thick && ball.y > d.cy - d.ry * 0.2) paintDisc(ctx, sprites, above, frame.angles[above], frame.lit);
  }
  if (frame.roulette) paintRoulette(ctx, frame.roulette);
  paintLadder(ctx, frame.level, frame.blink);
  if (frame.fireworks !== null) paintFireworks(ctx, frame.fireworks);
}

/** The ball's track's middle, for the tests: where on disc `level` the ball runs round. */
export const trackOf = (level: number) => ({ rx: DISC_PLACES[level].r * TRACK, ry: DISC_PLACES[level].ry * TRACK });
