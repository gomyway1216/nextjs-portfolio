/**
 * Draws the field on a canvas: the back panel with its gates, the pusher, the
 * two tables of medals, the open sides and the tray at the front, and over
 * them the lights, sparks and glass of an arcade cabinet. Nothing here decides
 * anything — it only shows the machine the engine is running.
 */

import { CHECKERS, FIELD, LANDING, MEDAL_RADIUS, PUSHER, RELEASE, pusherFront, type Machine, type Medal } from './engine';
import { HEIGHT, VIEW, project, rise, type Projected } from './view';

const TAU = Math.PI * 2;
const R = MEDAL_RADIUS;
const P = HEIGHT.pusher;
const T = HEIGHT.medal;
const W = FIELD.width;
const D = FIELD.depth;
const OPEN = FIELD.sideOpenFrom;
/** Seconds a medal takes to drop from the pusher's lip onto the lower table. */
const LIP_FALL = 0.14;
/** Seconds a medal that has left the field is still drawn for, on its way down. */
const EXIT_TIME = 0.5;
/** Seconds a gate, the tray or a side stays lit after a medal passes. */
const GLOW_TIME = 0.5;
const RELEASE_HEIGHT = RELEASE.height;
/** A prize ball is drawn this large. It overhangs the flat medals round it, so it touches them over less. */
const BALL_RADIUS = 4.3;
/** How far a gate's opening reaches up the back panel. */
const GATE = { halfWidth: R + CHECKERS.halfWidth, height: 11 } as const;
/** How long each kind of celebration lights the cabinet, in seconds. */
const PARTY_TIME = { crash: 0.5, fever: 5, jackpot: 9 } as const;
export type Party = keyof typeof PARTY_TIME;
/** The most sparks alive at once. */
const MAX_SPARKS = 220;
const SPARK_COLORS = ['#fff3a8', '#ffd65c', '#ff7cc0', '#7df0ff', '#b6ff8f', '#ffffff'] as const;

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

/** A count that floats up from the tray: the medals just won. */
interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
}

export interface Stage {
  /** Canvas pixels per pixel of the drawing. */
  ratio: number;
  background: HTMLCanvasElement;
  medal: HTMLCanvasElement;
  ball: HTMLCanvasElement;
  /** Seconds the stage has been drawn for, for its running lights. */
  clock: number;
  /** Where every medal on the field was last seen, to tell where one left it. */
  seen: Map<number, Seen>;
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

/** The same for the back panel at (x, height): one unit across, one unit down. */
function onPanel(g: CanvasRenderingContext2D, k: number, x: number, height: number): void {
  const o = project(x, height, 0);
  const u = project(x + 1, height, 0);
  const v = project(x, height - 1, 0);
  g.setTransform((u.x - o.x) * k, (u.y - o.y) * k, (v.x - o.x) * k, (v.y - o.y) * k, o.x * k, o.y * k);
}

const starPath = (g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void => {
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

  // The cabinet's inner sides, up to where they stop and leave the table open.
  for (const x of [0, W]) {
    const side = [project(x, 0, 0), project(x, 0, OPEN), project(x, HEIGHT.wall, OPEN), project(x, HEIGHT.wall, 0)];
    const shade = g.createLinearGradient(side[0].x, 0, side[1].x, 0);
    shade.addColorStop(0, '#241659');
    shade.addColorStop(1, '#0e0826');
    g.fillStyle = shade;
    path(g, side);
    g.fill();
    // Mirror panels up the side, a low rail along the table, and a lit pillar where the side ends.
    g.strokeStyle = 'rgba(190, 170, 255, 0.12)';
    g.lineWidth = 1.5;
    for (let depth = 10; depth < OPEN; depth += 12) line(g, project(x, HEIGHT.sideWall, depth), project(x, HEIGHT.wall, depth));
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
    line(g, project(x, 1, OPEN), project(x, HEIGHT.wall - 2, OPEN));
    g.strokeStyle = '#ff9bd0';
    g.lineWidth = 3.5;
    line(g, project(x, 1, OPEN), project(x, HEIGHT.wall - 2, OPEN));
  }

  // The back panel the medals come down.
  const panel = [project(0, 0, 0), project(W, 0, 0), project(W, HEIGHT.wall + 2, 0), project(0, HEIGHT.wall + 2, 0)];
  const panelShade = g.createLinearGradient(0, panel[2].y, 0, panel[0].y);
  panelShade.addColorStop(0, '#4a229a');
  panelShade.addColorStop(0.6, '#2a1268');
  panelShade.addColorStop(1, '#190b45');
  g.fillStyle = panelShade;
  path(g, panel);
  g.fill();
  // A sunburst behind the pins.
  g.save();
  path(g, panel);
  g.clip();
  const sun = project(W / 2, HEIGHT.wall + 2, 0);
  for (let i = 0; i < 18; i++) {
    const from = Math.PI * (i / 18);
    g.fillStyle = i % 2 === 0 ? 'rgba(255, 120, 200, 0.07)' : 'rgba(120, 220, 255, 0.05)';
    g.beginPath();
    g.moveTo(sun.x, sun.y);
    g.arc(sun.x, sun.y, 420, from, from + Math.PI / 18);
    g.closePath();
    g.fill();
  }
  g.restore();
  // Its pins, in staggered rows.
  for (let row = 0; row < 5; row++) {
    const height = P + GATE.height + 5 + row * 4.1;
    for (let x = row % 2 === 0 ? 5 : 8.75; x < W; x += 7.5) {
      const pin = project(x, height, 0);
      g.fillStyle = 'rgba(12, 4, 40, 0.65)';
      g.beginPath();
      g.arc(pin.x + 1.2, pin.y + 1.8, 2.6, 0, TAU);
      g.fill();
      const metal = g.createRadialGradient(pin.x - 0.8, pin.y - 0.8, 0.2, pin.x, pin.y, 2.4);
      metal.addColorStop(0, '#ffffff');
      metal.addColorStop(1, '#9d8fd6');
      g.fillStyle = metal;
      g.beginPath();
      g.arc(pin.x, pin.y, 2.2, 0, TAU);
      g.fill();
    }
  }
  // A sign over each gate.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const center of CHECKERS.positions) {
    onPanel(g, ratio, center, P + GATE.height + 2.4);
    g.font = '900 3.1px "Arial Black", Arial, sans-serif';
    g.fillStyle = '#fff3a8';
    g.fillText('START', 0, 0);
  }
  flat();

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

  // The open sides: a pit beside the table, and a red edge to warn of it.
  for (const [x, out] of [
    [0, -16],
    [W, W + 16],
  ]) {
    const pit = [project(x, 0, OPEN), project(x, 0, D + 4), project(out, 0, D + 4), project(out, 0, OPEN)];
    const dark = g.createLinearGradient(pit[0].x, 0, pit[3].x, 0);
    dark.addColorStop(0, '#4a0d1c');
    dark.addColorStop(1, '#0b0307');
    g.fillStyle = dark;
    path(g, pit);
    g.fill();
    g.strokeStyle = 'rgba(255, 84, 104, 0.3)';
    g.lineWidth = 7;
    line(g, project(x, 0, OPEN), project(x, 0, D));
    g.strokeStyle = '#ff6b81';
    g.lineWidth = 2.5;
    line(g, project(x, 0, OPEN), project(x, 0, D));
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
    const arrow = [project(x - 3.2, -7.5, D), project(x, -13, D), project(x + 3.2, -7.5, D)];
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
    clock: 0,
    seen: new Map(),
    exits: [],
    sparks: [],
    popups: [],
    tally: 0,
    tallyAge: 0,
    gateGlow: CHECKERS.positions.map(() => 0),
    trayGlow: 0,
    sideGlow: [0, 0],
    party: null,
  };
}

/** Lights the gate a medal has just come through. */
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
    const toFront = D - last.y;
    const toSide = Math.min(last.x, W - last.x);
    const isWon = last.ball || toFront <= toSide;
    const side = last.x < W / 2 ? -1 : 1;
    stage.exits.push({ id, x: last.x, y: last.y, kind: isWon ? 'won' : 'lost', side, ball: last.ball, age: 0 });
    if (isWon) {
      stage.trayGlow = GLOW_TIME;
      // A glint where it went over.
      const at = project(last.x, T, Math.min(D, last.y));
      for (let i = 0; i < (last.ball ? 14 : 2); i++) {
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
          color: SPARK_COLORS[(id + i) % 3],
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
const turnOf = (id: number): number => id * 2.399963;

/** Stamps one medal's face where `point` is, squashed to `tilt` and turned by `turn`. */
function stamp(g: CanvasRenderingContext2D, stage: Stage, point: Projected, tilt: number, turn: number, shift = 0): void {
  const k = stage.ratio;
  const rx = R * point.scale * k;
  const ry = rx * tilt;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  g.setTransform(rx * cos, ry * sin, -rx * sin, ry * cos, (point.x + shift) * k, point.y * k);
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
 * A table's medals: the shadows they throw, every rim in one fill, then the
 * faces from the back forward, and last whatever stands above them — towers
 * and balls.
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
    points.push(medal.ball ? null : project(medal.x, base + drop + T, medal.y));
  }
  g.setTransform(k, 0, 0, k, shift * k, 0);
  g.fillStyle = 'rgba(0, 4, 18, 0.34)';
  g.beginPath();
  for (const point of points) {
    if (!point) continue;
    const rx = R * point.scale * 1.06;
    const thickness = T * rise(point);
    g.moveTo(point.x + rx * 1.12, point.y + thickness * 1.9);
    g.ellipse(point.x + rx * 0.12, point.y + thickness * 1.9, rx, rx * point.tilt, 0, 0, TAU);
  }
  g.fill();
  g.fillStyle = '#8a5a08';
  g.beginPath();
  for (const point of points) {
    if (!point) continue;
    const rx = R * point.scale;
    const thickness = T * rise(point);
    g.moveTo(point.x + rx, point.y + thickness);
    g.ellipse(point.x, point.y + thickness, rx, rx * point.tilt, 0, 0, TAU);
    g.rect(point.x - rx, point.y, rx * 2, thickness);
  }
  g.fill();
  for (let i = 0; i < medals.length; i++) {
    const point = points[i];
    if (point) stamp(g, stage, point, point.tilt, turnOf(medals[i].id), shift);
  }
  for (let i = 0; i < medals.length; i++) {
    const medal = medals[i];
    if (medal.ball) drawBall(g, stage, medal.x, base + drops[i], medal.y, drops[i] === 0, shift);
    else if (medal.stack > 1) drawTower(g, stage, medal, base, shift);
  }
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** A row of bulbs between two points, lit in a running pattern. */
function bulbs(g: CanvasRenderingContext2D, from: Projected, to: Projected, count: number, phase: number, colors: readonly string[], size: number): void {
  for (let i = 0; i < count; i++) {
    const f = (i + 0.5) / count;
    const x = from.x + (to.x - from.x) * f;
    const y = from.y + (to.y - from.y) * f;
    const lit = (i + phase) % 3 === 0;
    if (lit) {
      g.fillStyle = 'rgba(255, 255, 255, 0.2)';
      g.beginPath();
      g.arc(x, y, size * 2.1, 0, TAU);
      g.fill();
    }
    g.fillStyle = lit ? colors[i % colors.length] : 'rgba(60, 40, 110, 0.9)';
    g.beginPath();
    g.arc(x, y, lit ? size : size * 0.8, 0, TAU);
    g.fill();
  }
}

export interface DrawOptions {
  /** Where the next medal would be let go. */
  aim: number;
  /** Whether to show how far a dropped medal can land from its aim. */
  showGuide: boolean;
  /** Leave out the motion that only decorates: running lights, flashes and the shake. */
  calm?: boolean;
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
  g.drawImage(stage.background, shake * k, 0);
  flat();

  // Running lights along the top of the back panel, along the rails and under the front edge.
  const partying = party !== null && party.kind !== 'crash';
  const phase = calm ? 0 : Math.floor(stage.clock * (partying ? 9 : 3));
  const lights: readonly string[] = partying ? SPARK_COLORS : ['#fff3a8', '#ffd65c'];
  bulbs(g, project(1, HEIGHT.wall - 1.2, 0), project(W - 1, HEIGHT.wall - 1.2, 0), 26, phase, lights, 2.6);
  bulbs(g, project(0, HEIGHT.sideWall + 2, 2), project(0, HEIGHT.sideWall + 2, OPEN - 2), 12, phase, lights, 2.2);
  bulbs(g, project(W, HEIGHT.sideWall + 2, 2), project(W, HEIGHT.sideWall + 2, OPEN - 2), 12, phase + 1, lights, 2.2);

  // Lights on the open sides and the tray, when a medal has just gone that way.
  for (const index of [0, 1]) {
    if (stage.sideGlow[index] <= 0) continue;
    const x = index === 0 ? 0 : W;
    const out = index === 0 ? -16 : W + 16;
    g.fillStyle = `rgba(255, 70, 96, ${0.45 * (stage.sideGlow[index] / GLOW_TIME)})`;
    path(g, [project(x, 0, OPEN), project(x, 0, D + 4), project(out, 0, D + 4), project(out, 0, OPEN)]);
    g.fill();
  }
  if (stage.trayGlow > 0) {
    g.fillStyle = `rgba(255, 214, 92, ${0.4 * (stage.trayGlow / GLOW_TIME)})`;
    path(g, [project(0, 0, D), project(W, 0, D), project(W, -18, D), project(0, -18, D)]);
    g.fill();
  }
  bulbs(g, project(2, -3, D), project(W - 2, -3, D), 30, phase, ['#ffd65c', '#fff3a8'], 2.4);

  // The pusher's front face, and the shadow it throws on the lower table.
  const face = [project(0, 0, front), project(W, 0, front), project(W, P, front), project(0, P, front)];
  const shadow = g.createLinearGradient(0, face[0].y, 0, project(0, 0, front + 8).y);
  shadow.addColorStop(0, 'rgba(0, 6, 20, 0.66)');
  shadow.addColorStop(1, 'rgba(0, 6, 20, 0)');
  g.fillStyle = shadow;
  path(g, [face[0], face[1], project(W, 0, front + 8), project(0, 0, front + 8)]);
  g.fill();
  const faceShade = g.createLinearGradient(0, face[2].y, 0, face[0].y);
  faceShade.addColorStop(0, '#c2cbe2');
  faceShade.addColorStop(0.35, '#7c88a8');
  faceShade.addColorStop(1, '#2a3148');
  g.fillStyle = faceShade;
  path(g, face);
  g.fill();
  bulbs(g, project(3, P / 2, front), project(W - 3, P / 2, front), 24, phase, ['#7df0ff', '#d6fbff'], 2.2);

  const lower: Medal[] = [];
  const upper: Medal[] = [];
  for (const medal of machine.medals) (medal.level === 0 ? lower : upper).push(medal);
  lower.sort(byDepth);
  upper.sort(byDepth);
  drawMedals(g, stage, lower, 0, shake);

  // The pusher's top: brushed steel with grooves and chevrons that travel with it.
  flat();
  const top = [project(0, P, 0), project(W, P, 0), project(W, P, front), project(0, P, front)];
  const topShade = g.createLinearGradient(0, top[0].y, 0, top[2].y);
  topShade.addColorStop(0, '#6c7693');
  topShade.addColorStop(0.7, '#c9d0e0');
  topShade.addColorStop(1, '#eef1f8');
  g.fillStyle = topShade;
  path(g, top);
  g.fill();
  g.strokeStyle = 'rgba(40, 50, 84, 0.2)';
  g.lineWidth = 1.5;
  for (let back = 9; front - back > 0; back += 9) line(g, project(0, P, front - back), project(W, P, front - back));
  g.fillStyle = 'rgba(255, 196, 40, 0.5)';
  for (let x = 4; x < W; x += 8) {
    path(g, [project(x, P, front - 0.3), project(x + 4, P, front - 0.3), project(x + 2, P, front - 2.6), project(x - 2, P, front - 2.6)]);
    g.fill();
  }
  g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  g.lineWidth = 2;
  line(g, top[3], top[2]);
  drawMedals(g, stage, upper, P, shake);
  flat();

  // The gates at the foot of the back panel.
  CHECKERS.positions.forEach((center, index) => {
    const lit = stage.gateGlow[index] / GLOW_TIME;
    const pulse = calm ? 0 : 0.5 + 0.5 * Math.sin(stage.clock * 4 + index * 2.1);
    const gate = [
      project(center - GATE.halfWidth, P, 0),
      project(center - GATE.halfWidth, P + GATE.height, 0),
      project(center + GATE.halfWidth, P + GATE.height, 0),
      project(center + GATE.halfWidth, P, 0),
    ];
    g.fillStyle = lit > 0 ? `rgba(255, 244, 150, ${0.25 + 0.5 * lit})` : 'rgba(6, 2, 20, 0.6)';
    path(g, gate);
    g.fill();
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(gate[0].x, gate[0].y);
    g.lineTo(gate[1].x, gate[1].y);
    g.lineTo(gate[2].x, gate[2].y);
    g.lineTo(gate[3].x, gate[3].y);
    g.strokeStyle = lit > 0 ? 'rgba(255, 244, 150, 0.55)' : `rgba(64, 226, 255, ${0.22 + 0.2 * pulse})`;
    g.lineWidth = 9;
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
    spread.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
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
      const point = project(medal.fromX + (medal.x - medal.fromX) * t, T + (from - T) * (1 - t * t), medal.fromY + (medal.y - medal.fromY) * t);
      stamp(g, stage, point, point.tilt * (0.4 + 0.6 * Math.abs(Math.cos(t * 9 + medal.id))), turnOf(medal.id) + t * 5, shake);
      continue;
    }
    const wobble = Math.sin(t * 9.5 + medal.id) * 1.3 * (1 - t);
    const x = medal.fromX + (medal.x - medal.fromX) * smooth(t) + wobble;
    const height = P + (RELEASE_HEIGHT - P) * (1 - t * t);
    const depth = medal.fromY + (medal.y - medal.fromY) * t ** 3;
    if (medal.ball) {
      drawBall(g, stage, x, height, depth, false, shake);
      continue;
    }
    const point = project(x, height + T, depth);
    // Upright against the panel on the way down, lying flat as it lands.
    const tilt = 0.92 + (point.tilt - 0.92) * smooth(Math.max(0, (t - 0.6) / 0.4));
    stamp(g, stage, point, tilt, turnOf(medal.id) + t * 7, shake);
  }

  // Whatever has just left the field, on its way down.
  for (const exit of stage.exits) {
    const a = exit.age;
    const forward = exit.kind === 'won' ? 16 * a : 0;
    const sideways = exit.kind === 'lost' ? exit.side * 12 * a : 0;
    g.globalAlpha = Math.max(0, 1 - (a / EXIT_TIME) ** 2);
    if (exit.ball) {
      drawBall(g, stage, exit.x, -70 * a * a, exit.y + forward, false, shake);
      continue;
    }
    const point = project(exit.x + sideways, T - 70 * a * a, exit.y + forward);
    stamp(g, stage, point, point.tilt * (0.35 + 0.65 * Math.abs(Math.cos(a * 13 + exit.id))), turnOf(exit.id), shake);
  }
  g.globalAlpha = 1;
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
    g.strokeStyle = '#3a2400';
    g.strokeText(popup.text, popup.x, y);
    g.fillStyle = '#ffe98a';
    g.fillText(popup.text, popup.x, y);
  }
  g.globalAlpha = 1;

  // A fever or a jackpot washes the cabinet with colour.
  if (!calm && partying) {
    const hue = (stage.clock * 160) % 360;
    g.fillStyle = `hsla(${hue}, 100%, 60%, ${0.07 + 0.05 * Math.sin(stage.clock * 12)})`;
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
