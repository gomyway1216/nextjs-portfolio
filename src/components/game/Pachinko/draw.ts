/**
 * The board drawn on a canvas: what never moves (the painted board, the rails, the nails, the pockets' frames) once
 * into a layer of its own, and over it each frame what does (the windmill, the 電チュー's wings, the attacker's door,
 * the lamps, the balls). A canvas, not an element a ball: a hundred balls a minute cost a few circles a frame.
 *
 * The board's art is the machine's own: a summer night's pond, goldfish lanterns hung along its rails. Nothing of a
 * real machine's is drawn.
 */

import { ATTACKER_W, BALL_R, BOARD_H, BOARD_W, GATE, NAILS, OUT_HOLE, POCKETS, RAIL, SCREEN, WINDMILL, railPoint, type Point } from './scene';

const TAU = Math.PI * 2;

/** What moves on the board this frame. */
export interface BoardLook {
  /** The 電チュー open (with the 電チュー helping), and how far its wings are spread now, 0 to 1. */
  tulip: number;
  /** The attacker's door, 0 shut to 1 open. */
  attacker: number;
  /** The windmill's turn, in radians. */
  windmill: number;
  /** The frame's lamps: off, a reach's, or a hit's. */
  lamps: 'off' | 'reach' | 'hit';
  /** The moment, in ms, for the lamps' chase. */
  at: number;
}

/** Paints the board's still parts into `ctx`, `scale` pixels to a unit. */
export function drawStill(ctx: CanvasRenderingContext2D, scale: number): void {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  // The cabinet's frame round the glass.
  ctx.fillStyle = '#1b1020';
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  // The pond: deep water under the glass, lighter toward the screen.
  const water = ctx.createRadialGradient(150, 150, 20, 150, 170, 190);
  water.addColorStop(0, '#1d6f8f');
  water.addColorStop(0.6, '#0f4565');
  water.addColorStop(1, '#0a2740');
  ctx.beginPath();
  ctx.arc(RAIL.x, RAIL.y, RAIL.r + 2, 0, TAU);
  ctx.fillStyle = water;
  ctx.fill();
  // Lily pads and ripples.
  ctx.fillStyle = 'rgba(64, 160, 96, 0.55)';
  for (const [x, y, r] of [
    [44, 236, 12],
    [256, 120, 10],
    [118, 292, 9],
    [190, 284, 8],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0.35, TAU - 0.35);
    ctx.lineTo(x, y);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(180, 230, 255, 0.18)';
  ctx.lineWidth = 0.8;
  for (const [x, y, r] of [
    [70, 120, 14],
    [234, 300, 12],
    [150, 270, 18],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.4, 0, 0, TAU);
    ctx.stroke();
  }
  // The rails: the outer guide rail the ball runs up, and the inner one.
  for (const [inset, width, color] of [
    [0, 3, '#d8dee6'],
    [9, 1.6, '#9aa6b2'],
  ] as const) {
    ctx.beginPath();
    ctx.arc(RAIL.x, RAIL.y, RAIL.r - inset, Math.PI * 0.18, Math.PI * 0.82, true);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  // Goldfish lanterns hung along the rail.
  for (const a of [140, 105, 75, 40]) {
    const p = railPoint(a, 20);
    lantern(ctx, p.x, p.y, 7);
  }
  // The screen's frame (役物) and its ledge (ステージ).
  ctx.fillStyle = '#5a1d2a';
  roundRect(ctx, SCREEN.x - 7, SCREEN.y - 7, SCREEN.w + 14, SCREEN.h + 22, 12);
  ctx.fill();
  ctx.fillStyle = '#c8962e';
  roundRect(ctx, SCREEN.x - 4, SCREEN.y + SCREEN.h + 2, SCREEN.w + 8, 5, 2);
  ctx.fill();
  // The nails, brass, each with its glint.
  for (const { x, y } of NAILS) {
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, TAU);
    ctx.fillStyle = '#c9a54a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 0.5, y - 0.5, 0.6, 0, TAU);
    ctx.fillStyle = '#fff3c4';
    ctx.fill();
  }
  // The windmill's hub.
  ctx.beginPath();
  ctx.arc(WINDMILL.x, WINDMILL.y, 3, 0, TAU);
  ctx.fillStyle = '#e8e8e8';
  ctx.fill();
  // The ヘソ: a cup under the screen, and its label.
  pocketCup(ctx, POCKETS.heso.x, POCKETS.heso.y, 9, '#e8b23a');
  // The side pocket (袖).
  pocketCup(ctx, POCKETS.side.x, POCKETS.side.y, 7, '#7fb3d5');
  // The gate (スルー).
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(GATE.x - 5, GATE.y - 3, 10, 6);
  // The attacker's plate.
  ctx.fillStyle = '#3c2a12';
  roundRect(ctx, POCKETS.attacker.x - ATTACKER_W / 2 - 3, POCKETS.attacker.y - 6, ATTACKER_W + 6, 13, 3);
  ctx.fill();
  // OUT at the foot.
  ctx.beginPath();
  ctx.ellipse(OUT_HOLE.x, OUT_HOLE.y, 16, 6, 0, 0, TAU);
  ctx.fillStyle = '#05070c';
  ctx.fill();
  ctx.fillStyle = '#c9d2dc';
  ctx.font = 'bold 7px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OUT', OUT_HOLE.x, OUT_HOLE.y + 2.5);
  ctx.restore();
}

/** Paints what moves over the still layer: the windmill, the tulip, the attacker, the lamps, and the balls at `balls`. */
export function drawMoving(ctx: CanvasRenderingContext2D, scale: number, look: BoardLook, balls: readonly Point[]): void {
  ctx.save();
  ctx.scale(scale, scale);
  // The windmill's four blades.
  ctx.save();
  ctx.translate(WINDMILL.x, WINDMILL.y);
  ctx.rotate(look.windmill);
  ctx.fillStyle = '#f2f2f2';
  for (let i = 0; i < 4; i++) {
    ctx.rotate(TAU / 4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(WINDMILL.r, -2.6);
    ctx.lineTo(WINDMILL.r, 2.6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // The 電チュー: a cup whose two wings spread to catch.
  const d = POCKETS.denchu;
  const spread = 0.25 + look.tulip * 0.9;
  ctx.fillStyle = '#e9e1d0';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(d.x + side * 4, d.y - 2);
    ctx.rotate(side * spread);
    ctx.fillRect(-1.2, -10, 2.4, 10);
    ctx.restore();
  }
  pocketCup(ctx, d.x, d.y, 6, look.tulip > 0.5 ? '#ff6b6b' : '#b55252');
  // The attacker's door: a lid that tips forward to open.
  const a = POCKETS.attacker;
  const open = look.attacker;
  ctx.fillStyle = open > 0.5 ? '#ffd23f' : '#b98d2b';
  ctx.fillRect(a.x - ATTACKER_W / 2, a.y - 4 - open * 6, ATTACKER_W, 4 + open * 2);
  if (open > 0.5) {
    ctx.fillStyle = '#100800';
    ctx.fillRect(a.x - ATTACKER_W / 2 + 2, a.y - 2, ATTACKER_W - 4, 6);
  }
  // The lamps round the screen's frame: a chase on a reach, every one lit on a hit.
  if (look.lamps !== 'off') {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const lit = look.lamps === 'hit' ? Math.floor(look.at / 120) % 2 === i % 2 : Math.floor(look.at / 70) % n === i;
      if (!lit) continue;
      const k = i / n;
      const x = SCREEN.x - 5 + (k < 0.5 ? k * 2 * (SCREEN.w + 10) : (1 - (k - 0.5) * 2) * (SCREEN.w + 10));
      const y = k < 0.5 ? SCREEN.y - 9 : SCREEN.y + SCREEN.h + 13;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fillStyle = look.lamps === 'hit' ? '#ffe066' : '#ff8fa3';
      ctx.fill();
    }
  }
  // The balls: steel, each with its highlight.
  for (const { x, y } of balls) {
    ctx.beginPath();
    ctx.arc(x, y, BALL_R, 0, TAU);
    ctx.fillStyle = '#c3cbd3';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 1.1, y - 1.2, 1.2, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pocketCup(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.lineTo(x - r, y - 2);
  ctx.lineTo(x + r, y - 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y - 1, r - 2, 2, 0, 0, TAU);
  ctx.fillStyle = '#0b0b10';
  ctx.fill();
}

/** A goldfish lantern: a round red paper body with a tail, and its glow. */
function lantern(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, TAU);
  ctx.fillStyle = 'rgba(255, 140, 90, 0.16)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.8, 0, 0, TAU);
  ctx.fillStyle = '#e8432f';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.8, y);
  ctx.lineTo(x + r * 1.6, y - r * 0.6);
  ctx.lineTo(x + r * 1.6, y + r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.45, y - r * 0.2, r * 0.18, 0, TAU);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
}
