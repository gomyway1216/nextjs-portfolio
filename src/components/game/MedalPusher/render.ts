/**
 * Draws the field on a canvas: the back panel with its gates, the pusher, the
 * two tables of medals, the open sides and the tray at the front. Nothing here
 * decides anything — it only shows the machine the engine is running.
 */

import { CHECKERS, FIELD, LANDING, MEDAL_RADIUS, PUSHER, RELEASE, pusherFront, type Machine, type Medal } from './engine';
import { HEIGHT, VIEW, project, rise, type Projected } from './view';

const TAU = Math.PI * 2;
const R = MEDAL_RADIUS;
const P = HEIGHT.pusher;
const T = HEIGHT.medal;
/** Seconds a medal takes to drop from the pusher's lip onto the lower table. */
const LIP_FALL = 0.14;
/** Seconds a medal that has left the field is still drawn for, on its way down. */
const EXIT_TIME = 0.5;
/** Seconds a gate, the tray or a side stays lit after a medal passes. */
const GLOW_TIME = 0.5;
/** How far a gate's opening reaches up the back panel. */
const RELEASE_HEIGHT = RELEASE.height;
/** A prize ball is drawn this large. It overhangs the flat medals round it, so it touches them over less. */
const BALL_RADIUS = 4.3;
const GATE = { halfWidth: R + CHECKERS.halfWidth, height: 11 } as const;

interface ExitingMedal {
  id: number;
  x: number;
  y: number;
  kind: 'won' | 'lost';
  /** −1 for the left side, 1 for the right. */
  side: number;
  ball: boolean;
  age: number;
}

/** What the stage remembers of a medal between frames. */
interface Seen {
  x: number;
  y: number;
  ball: boolean;
  /** Whether it was a tower: a tower that disappears has toppled, not left the field. */
  tower: boolean;
}

export interface Stage {
  /** Canvas pixels per pixel of the drawing. */
  ratio: number;
  background: HTMLCanvasElement;
  medal: HTMLCanvasElement;
  ball: HTMLCanvasElement;
  /** Where every medal on the field was last seen, to tell where one left it. */
  seen: Map<number, Seen>;
  exits: ExitingMedal[];
  /** Seconds each light has left to shine. */
  gateGlow: number[];
  trayGlow: number;
  sideGlow: [number, number];
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

/** One medal seen from straight above, drawn once and stamped wherever a medal lies. */
function medalSprite(): HTMLCanvasElement {
  const size = 128;
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
  body.addColorStop(0, '#fff7c9');
  body.addColorStop(0.4, '#f9cf4d');
  body.addColorStop(1, '#c98c14');
  g.fillStyle = body;
  circle(r);
  g.fill();

  g.lineWidth = r * 0.1;
  g.strokeStyle = '#9d6506';
  circle(r * 0.95);
  g.stroke();
  g.lineWidth = r * 0.05;
  g.strokeStyle = 'rgba(255, 249, 210, 0.85)';
  circle(r * 0.85);
  g.stroke();
  g.lineWidth = r * 0.04;
  g.strokeStyle = 'rgba(132, 84, 4, 0.6)';
  circle(r * 0.68);
  g.stroke();

  // An embossed star: a dark copy below-right, a light copy above-left, the face on top.
  const star = (dx: number, dy: number, fill: string) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? r * 0.5 : r * 0.21;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(dx + Math.cos(angle) * radius, dy + Math.sin(angle) * radius);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  star(r * 0.035, r * 0.04, 'rgba(120, 74, 0, 0.7)');
  star(-r * 0.03, -r * 0.035, '#fff6c0');
  star(0, 0, '#f4c03c');
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
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r * 0.46 : r * 0.19;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(Math.cos(angle) * radius, r * 0.08 + Math.sin(angle) * radius);
  }
  g.closePath();
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

/** Everything that never moves, drawn once at the canvas's own resolution. */
function backgroundLayer(ratio: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(VIEW.width * ratio);
  canvas.height = Math.round(VIEW.height * ratio);
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.scale(ratio, ratio);
  const W = FIELD.width;
  const D = FIELD.depth;
  const open = FIELD.sideOpenFrom;

  const backdrop = g.createLinearGradient(0, 0, 0, VIEW.height);
  backdrop.addColorStop(0, '#0d0722');
  backdrop.addColorStop(1, '#05030d');
  g.fillStyle = backdrop;
  g.fillRect(0, 0, VIEW.width, VIEW.height);

  // The cabinet's inner sides, up to where they stop and leave the table open.
  for (const x of [0, W]) {
    const side = [project(x, 0, 0), project(x, 0, open), project(x, HEIGHT.wall, open), project(x, HEIGHT.wall, 0)];
    const shade = g.createLinearGradient(side[0].x, 0, side[1].x, 0);
    shade.addColorStop(0, '#1d1247');
    shade.addColorStop(1, '#0e0826');
    g.fillStyle = shade;
    path(g, side);
    g.fill();
    // A low rail along the table, and a lit pillar where the side ends.
    g.fillStyle = 'rgba(126, 104, 220, 0.35)';
    path(g, [project(x, 0, 0), project(x, 0, open), project(x, HEIGHT.sideWall, open), project(x, HEIGHT.sideWall, 0)]);
    g.fill();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 86, 170, 0.35)';
    g.lineWidth = 9;
    line(g, project(x, 1, open), project(x, HEIGHT.wall - 2, open));
    g.strokeStyle = '#ff7cc0';
    g.lineWidth = 3;
    line(g, project(x, 1, open), project(x, HEIGHT.wall - 2, open));
  }

  // The back panel the medals come down.
  const panel = [project(0, 0, 0), project(W, 0, 0), project(W, HEIGHT.wall + 2, 0), project(0, HEIGHT.wall + 2, 0)];
  const panelShade = g.createLinearGradient(0, panel[2].y, 0, panel[0].y);
  panelShade.addColorStop(0, '#3a1b78');
  panelShade.addColorStop(1, '#1a0c45');
  g.fillStyle = panelShade;
  path(g, panel);
  g.fill();
  // Its pins, in staggered rows.
  for (let row = 0; row < 5; row++) {
    const height = P + GATE.height + 4 + row * 4.2;
    for (let x = row % 2 === 0 ? 5 : 8.75; x < W; x += 7.5) {
      const pin = project(x, height, 0);
      g.fillStyle = 'rgba(20, 8, 50, 0.6)';
      g.beginPath();
      g.arc(pin.x + 1, pin.y + 1.4, 2.3, 0, TAU);
      g.fill();
      g.fillStyle = '#d9ccff';
      g.beginPath();
      g.arc(pin.x, pin.y, 1.9, 0, TAU);
      g.fill();
    }
  }

  // The lower table.
  const floor = [project(0, 0, 0), project(W, 0, 0), project(W, 0, D), project(0, 0, D)];
  const floorShade = g.createLinearGradient(0, floor[0].y, 0, floor[2].y);
  floorShade.addColorStop(0, '#07203d');
  floorShade.addColorStop(0.55, '#0c3a66');
  floorShade.addColorStop(1, '#13588c');
  g.fillStyle = floorShade;
  path(g, floor);
  g.fill();
  g.strokeStyle = 'rgba(160, 215, 255, 0.07)';
  g.lineWidth = 1.5;
  for (let x = 10; x < W; x += 10) line(g, project(x, 0, PUSHER.min), project(x, 0, D));
  // A sheen across the front half.
  const sheen = g.createLinearGradient(0, project(0, 0, 55).y, 0, floor[2].y);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(1, 'rgba(190, 230, 255, 0.12)');
  g.fillStyle = sheen;
  path(g, [project(0, 0, 55), project(W, 0, 55), project(W, 0, D), project(0, 0, D)]);
  g.fill();

  // The open sides: a pit beside the table, and a red edge to warn of it.
  for (const [x, out] of [
    [0, -16],
    [W, W + 16],
  ]) {
    const pit = [project(x, 0, open), project(x, 0, D + 4), project(out, 0, D + 4), project(out, 0, open)];
    const dark = g.createLinearGradient(pit[0].x, 0, pit[3].x, 0);
    dark.addColorStop(0, '#4a0d1c');
    dark.addColorStop(1, '#0b0307');
    g.fillStyle = dark;
    path(g, pit);
    g.fill();
    g.strokeStyle = 'rgba(255, 84, 104, 0.3)';
    g.lineWidth = 7;
    line(g, project(x, 0, open), project(x, 0, D));
    g.strokeStyle = '#ff6b81';
    g.lineWidth = 2.5;
    line(g, project(x, 0, open), project(x, 0, D));
    // An arrow pointing out: this way lies the pit.
    const toward = out < x ? -1 : 1;
    const arrow = [project(x + toward * 5, 0, 85), project(x + toward * 10, 0, 89.5), project(x + toward * 5, 0, 94)];
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(arrow[0].x, arrow[0].y);
    g.lineTo(arrow[1].x, arrow[1].y);
    g.lineTo(arrow[2].x, arrow[2].y);
    g.stroke();
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
  // Arrows pointing down into the tray.
  g.strokeStyle = 'rgba(255, 214, 92, 0.8)';
  g.lineJoin = 'round';
  for (let x = 14; x < W; x += 12) {
    const arrow = [project(x - 3.2, -5, D), project(x, -10.5, D), project(x + 3.2, -5, D)];
    g.beginPath();
    g.moveTo(arrow[0].x, arrow[0].y);
    g.lineTo(arrow[1].x, arrow[1].y);
    g.lineTo(arrow[2].x, arrow[2].y);
    g.stroke();
  }
  return canvas;
}

export function createStage(ratio: number): Stage {
  return {
    ratio,
    background: backgroundLayer(ratio),
    medal: medalSprite(),
    ball: ballSprite(),
    seen: new Map(),
    exits: [],
    gateGlow: CHECKERS.positions.map(() => 0),
    trayGlow: 0,
    sideGlow: [0, 0],
  };
}

/** Lights the gate a medal has just come through. */
export function lightGate(stage: Stage, gate: number): void {
  if (gate >= 0 && gate < stage.gateGlow.length) stage.gateGlow[gate] = GLOW_TIME;
}

/**
 * Notes which medals have left the field since the last frame and starts each
 * one falling: over the front into the tray, or off an open side.
 */
export function trackMedals(stage: Stage, machine: Machine): void {
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
      present.set(medal.id, { x: medal.x, y: medal.y, ball: medal.ball, tower: medal.stack > 1 });
    }
  }
  for (const [id, last] of stage.seen) {
    // A tower that is gone went over the lip, and its medals are already in the air.
    if (last.tower) continue;
    const toFront = FIELD.depth - last.y;
    const toSide = Math.min(last.x, FIELD.width - last.x);
    const won = last.ball || toFront <= toSide;
    const side = last.x < FIELD.width / 2 ? -1 : 1;
    stage.exits.push({ id, x: last.x, y: last.y, kind: won ? 'won' : 'lost', side, ball: last.ball, age: 0 });
    if (won) stage.trayGlow = GLOW_TIME;
    else stage.sideGlow[side < 0 ? 0 : 1] = GLOW_TIME;
  }
  stage.seen = present;
}

/** Ages the lights and the medals on their way out. */
export function ageStage(stage: Stage, dt: number): void {
  for (const exit of stage.exits) exit.age += dt;
  if (stage.exits.length > 0 && stage.exits[0].age >= EXIT_TIME) stage.exits = stage.exits.filter((exit) => exit.age < EXIT_TIME);
  for (let i = 0; i < stage.gateGlow.length; i++) stage.gateGlow[i] = Math.max(0, stage.gateGlow[i] - dt);
  stage.trayGlow = Math.max(0, stage.trayGlow - dt);
  stage.sideGlow[0] = Math.max(0, stage.sideGlow[0] - dt);
  stage.sideGlow[1] = Math.max(0, stage.sideGlow[1] - dt);
}

/** The turn each medal lies at, fixed by its id so a pile does not look stamped. */
const turnOf = (id: number): number => id * 2.399963;

/** Stamps one medal's face where `point` is, squashed to `tilt` and turned by `turn`. */
function stamp(g: CanvasRenderingContext2D, stage: Stage, point: Projected, tilt: number, turn: number): void {
  const k = stage.ratio;
  const rx = R * point.scale * k;
  const ry = rx * tilt;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  g.setTransform(rx * cos, ry * sin, -rx * sin, ry * cos, point.x * k, point.y * k);
  g.drawImage(stage.medal, -1, -1, 2, 2);
}

const byDepth = (a: Medal, b: Medal): number => a.y - b.y;

/** A prize ball standing at `height` above the lower table, with the shadow it throws when it rests on something. */
function drawBall(g: CanvasRenderingContext2D, stage: Stage, x: number, height: number, depth: number, resting: boolean): void {
  const k = stage.ratio;
  if (resting) {
    const foot = project(x, height, depth);
    const rx = BALL_RADIUS * foot.scale * 0.95;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = 'rgba(0, 0, 14, 0.38)';
    g.beginPath();
    g.ellipse(foot.x, foot.y, rx, rx * foot.tilt, 0, 0, TAU);
    g.fill();
  }
  const centre = project(x, height + BALL_RADIUS, depth);
  const r = BALL_RADIUS * centre.scale * k;
  g.setTransform(r, 0, 0, r, centre.x * k, centre.y * k);
  g.drawImage(stage.ball, -1, -1, 2, 2);
}

/** The medals of a tower above its lowest one: a column with a rim line for each, and the top medal's face. */
function drawTower(g: CanvasRenderingContext2D, stage: Stage, tower: Medal, base: number): void {
  const k = stage.ratio;
  const foot = project(tower.x, base + T, tower.y);
  const head = project(tower.x, base + tower.stack * T, tower.y);
  const rx0 = R * foot.scale;
  const ry0 = rx0 * foot.tilt;
  const rx1 = R * head.scale;
  const ry1 = rx1 * head.tilt;
  g.setTransform(k, 0, 0, k, 0, 0);
  const shade = g.createLinearGradient(foot.x - rx0, 0, foot.x + rx0, 0);
  shade.addColorStop(0, '#7a4f06');
  shade.addColorStop(0.3, '#f6cb55');
  shade.addColorStop(0.6, '#c98c14');
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
  stamp(g, stage, head, head.tilt, turnOf(tower.id));
}

/**
 * A table's medals: every rim first, in one fill, then the faces from the back
 * forward, and last whatever stands above them — towers and balls.
 */
function drawMedals(g: CanvasRenderingContext2D, stage: Stage, medals: Medal[], base: number): void {
  if (medals.length === 0) return;
  const k = stage.ratio;
  const points: (Projected | null)[] = [];
  const drops: number[] = [];
  g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = '#8a5a08';
  g.beginPath();
  for (const medal of medals) {
    // A medal that has just come over the lip is still on its way down to the lower table.
    const drop = medal.level === 0 && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL ? P * (1 - (medal.sinceDrop / LIP_FALL) ** 2) : 0;
    drops.push(drop);
    if (medal.ball) {
      points.push(null);
      continue;
    }
    const point = project(medal.x, base + drop + T, medal.y);
    points.push(point);
    const rx = R * point.scale;
    const thickness = T * rise(point);
    g.moveTo(point.x + rx, point.y + thickness);
    g.ellipse(point.x, point.y + thickness, rx, rx * point.tilt, 0, 0, TAU);
    g.rect(point.x - rx, point.y, rx * 2, thickness);
  }
  g.fill();
  for (let i = 0; i < medals.length; i++) {
    const point = points[i];
    if (point) stamp(g, stage, point, point.tilt, turnOf(medals[i].id));
  }
  for (let i = 0; i < medals.length; i++) {
    const medal = medals[i];
    if (medal.ball) drawBall(g, stage, medal.x, base + drops[i], medal.y, drops[i] === 0);
    else if (medal.stack > 1) drawTower(g, stage, medal, base);
  }
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

export interface DrawOptions {
  /** Where the next medal would be let go. */
  aim: number;
  /** How far a dropped medal can land from its aim, for the guide. */
  showGuide: boolean;
}

/** Draws one frame of the field. */
export function drawField(g: CanvasRenderingContext2D, stage: Stage, machine: Machine, options: DrawOptions): void {
  const k = stage.ratio;
  const W = FIELD.width;
  const front = pusherFront(machine.time);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.drawImage(stage.background, 0, 0);
  g.setTransform(k, 0, 0, k, 0, 0);

  // Lights on the open sides and the tray, when a medal has just gone that way.
  for (const index of [0, 1]) {
    if (stage.sideGlow[index] <= 0) continue;
    const x = index === 0 ? 0 : W;
    const out = index === 0 ? -16 : W + 16;
    g.fillStyle = `rgba(255, 70, 96, ${0.45 * (stage.sideGlow[index] / GLOW_TIME)})`;
    path(g, [project(x, 0, FIELD.sideOpenFrom), project(x, 0, FIELD.depth + 4), project(out, 0, FIELD.depth + 4), project(out, 0, FIELD.sideOpenFrom)]);
    g.fill();
  }
  if (stage.trayGlow > 0) {
    g.fillStyle = `rgba(255, 214, 92, ${0.4 * (stage.trayGlow / GLOW_TIME)})`;
    path(g, [project(0, 0, FIELD.depth), project(W, 0, FIELD.depth), project(W, -18, FIELD.depth), project(0, -18, FIELD.depth)]);
    g.fill();
  }

  // The pusher's front face, and the shadow it throws on the lower table.
  const face = [project(0, 0, front), project(W, 0, front), project(W, P, front), project(0, P, front)];
  const shadow = g.createLinearGradient(0, face[0].y, 0, project(0, 0, front + 7).y);
  shadow.addColorStop(0, 'rgba(0, 6, 20, 0.6)');
  shadow.addColorStop(1, 'rgba(0, 6, 20, 0)');
  g.fillStyle = shadow;
  path(g, [face[0], face[1], project(W, 0, front + 7), project(0, 0, front + 7)]);
  g.fill();
  const faceShade = g.createLinearGradient(0, face[2].y, 0, face[0].y);
  faceShade.addColorStop(0, '#9aa5c2');
  faceShade.addColorStop(1, '#343c55');
  g.fillStyle = faceShade;
  path(g, face);
  g.fill();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(64, 226, 255, 0.3)';
  g.lineWidth = 6;
  line(g, project(2, P / 2, front), project(W - 2, P / 2, front));
  g.strokeStyle = '#7df0ff';
  g.lineWidth = 2;
  line(g, project(2, P / 2, front), project(W - 2, P / 2, front));

  const lower: Medal[] = [];
  const upper: Medal[] = [];
  for (const medal of machine.medals) (medal.level === 0 ? lower : upper).push(medal);
  lower.sort(byDepth);
  upper.sort(byDepth);
  drawMedals(g, stage, lower, 0);

  // The pusher's top, with grooves that travel with it.
  g.setTransform(k, 0, 0, k, 0, 0);
  const top = [project(0, P, 0), project(W, P, 0), project(W, P, front), project(0, P, front)];
  const topShade = g.createLinearGradient(0, top[0].y, 0, top[2].y);
  topShade.addColorStop(0, '#77819d');
  topShade.addColorStop(1, '#d9dfec');
  g.fillStyle = topShade;
  path(g, top);
  g.fill();
  g.strokeStyle = 'rgba(40, 50, 84, 0.22)';
  g.lineWidth = 1.5;
  for (let back = 9; front - back > 0; back += 9) line(g, project(0, P, front - back), project(W, P, front - back));
  g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  g.lineWidth = 2;
  line(g, top[3], top[2]);
  drawMedals(g, stage, upper, P);
  g.setTransform(k, 0, 0, k, 0, 0);

  // The gates at the foot of the back panel.
  CHECKERS.positions.forEach((center, index) => {
    const lit = stage.gateGlow[index] / GLOW_TIME;
    const gate = [
      project(center - GATE.halfWidth, P, 0),
      project(center - GATE.halfWidth, P + GATE.height, 0),
      project(center + GATE.halfWidth, P + GATE.height, 0),
      project(center + GATE.halfWidth, P, 0),
    ];
    g.fillStyle = lit > 0 ? `rgba(255, 244, 150, ${0.25 + 0.5 * lit})` : 'rgba(6, 2, 20, 0.55)';
    path(g, gate);
    g.fill();
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(gate[0].x, gate[0].y);
    g.lineTo(gate[1].x, gate[1].y);
    g.lineTo(gate[2].x, gate[2].y);
    g.lineTo(gate[3].x, gate[3].y);
    g.strokeStyle = lit > 0 ? 'rgba(255, 244, 150, 0.5)' : 'rgba(64, 226, 255, 0.3)';
    g.lineWidth = 8;
    g.stroke();
    g.strokeStyle = lit > 0 ? '#fffbe0' : '#7df0ff';
    g.lineWidth = 2.5;
    g.stroke();
  });

  // Where the next medal will be let go, and how far from that it can land.
  const aim = options.aim;
  if (options.showGuide) {
    const tip = project(aim, RELEASE_HEIGHT, 0);
    const left = project(Math.max(R, aim - LANDING.scatter), P, 0);
    const right = project(Math.min(W - R, aim + LANDING.scatter), P, 0);
    const spread = g.createLinearGradient(0, tip.y, 0, left.y);
    spread.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    spread.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
    g.fillStyle = spread;
    path(g, [tip, right, left]);
    g.fill();
  }
  const chute = [
    project(aim - 5, HEIGHT.wall + 2, 0),
    project(aim + 5, HEIGHT.wall + 2, 0),
    project(aim + 2.8, RELEASE_HEIGHT, 0),
    project(aim - 2.8, RELEASE_HEIGHT, 0),
  ];
  const chrome = g.createLinearGradient(chute[0].x, 0, chute[1].x, 0);
  chrome.addColorStop(0, '#8d97b3');
  chrome.addColorStop(0.5, '#f4f7fd');
  chrome.addColorStop(1, '#8d97b3');
  g.fillStyle = chrome;
  path(g, chute);
  g.fill();
  g.strokeStyle = '#2b3350';
  g.lineWidth = 1.5;
  g.stroke();

  // Medals in the air: down the back panel from the chute, or off a tower that is going over.
  for (const medal of machine.falling) {
    const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
    if (medal.source === 'spill') {
      const from = P + T * (medal.rank + 1);
      const point = project(
        medal.fromX + (medal.x - medal.fromX) * t,
        T + (from - T) * (1 - t * t),
        medal.fromY + (medal.y - medal.fromY) * t,
      );
      stamp(g, stage, point, point.tilt * (0.4 + 0.6 * Math.abs(Math.cos(t * 9 + medal.id))), turnOf(medal.id) + t * 5);
      continue;
    }
    const wobble = Math.sin(t * 9.5 + medal.id) * 1.3 * (1 - t);
    const x = medal.fromX + (medal.x - medal.fromX) * smooth(t) + wobble;
    const height = P + (RELEASE_HEIGHT - P) * (1 - t * t);
    const depth = medal.fromY + (medal.y - medal.fromY) * t ** 3;
    if (medal.ball) {
      drawBall(g, stage, x, height, depth, false);
      continue;
    }
    const point = project(x, height + T, depth);
    // Upright against the panel on the way down, lying flat as it lands.
    const tilt = 0.92 + (point.tilt - 0.92) * smooth(Math.max(0, (t - 0.6) / 0.4));
    stamp(g, stage, point, tilt, turnOf(medal.id) + t * 7);
  }

  // Whatever has just left the field, on its way down.
  for (const exit of stage.exits) {
    const a = exit.age;
    const forward = exit.kind === 'won' ? 16 * a : 0;
    const sideways = exit.kind === 'lost' ? exit.side * 12 * a : 0;
    g.globalAlpha = Math.max(0, 1 - (a / EXIT_TIME) ** 2);
    if (exit.ball) {
      drawBall(g, stage, exit.x, -70 * a * a, exit.y + forward, false);
      continue;
    }
    const point = project(exit.x + sideways, T - 70 * a * a, exit.y + forward);
    stamp(g, stage, point, point.tilt * (0.35 + 0.65 * Math.abs(Math.cos(a * 13 + exit.id))), turnOf(exit.id));
  }
  g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
}
