/**
 * The payout works on the canvas: the hopper's two doors in the hood's face
 * with the medals pouring out of them, and the two tower tubes in their
 * windows at the screen's lower corners, with the stacks in them, the gates,
 * the arms, and the towers the arms push out. It draws what works.ts says is
 * there and decides nothing. The canvas renderer calls it in these places:
 * `paintWindows` once, onto the background, for what of the windows never
 * moves; `drawTubes` once the background is down, for what is inside the
 * windows; `drawArms` once the pusher's medals are down; `drawHopper` once
 * the hood has been laid over whatever is still inside it; and
 * `drawTubeCounts` last of all, over the windows, as the 3D scene's page
 * does on its own glass.
 *
 * It takes nothing from render.ts, which takes these from it: what it needs
 * of the renderer, a medal's stamp and a tower's column, is handed in.
 */

import { MEDAL_RADIUS, MEDAL_THICKNESS, type Machine, type Medal } from './engine';
import { DOORS, POUR } from './hopper';
import { TUBE } from './stacker';
import { ARM, DECK, DOOR, GATE, GLASS, PLATFORM, WINDOW, chuteShows, countText, doorLampLit, doorSwing, onArm, onFlap, pourPose, tubeViews } from './works';
import { HOUSING, project, rise, type Projected } from './view';

const R = MEDAL_RADIUS;
const T = MEDAL_THICKNESS;
const TAU = Math.PI * 2;

const trace = (g: CanvasRenderingContext2D, points: readonly Projected[]): void => {
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.closePath();
};

const stroke = (g: CanvasRenderingContext2D, from: Projected, to: Projected): void => {
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(to.x, to.y);
  g.stroke();
};

/** A patch of the hood's face: from `left` to `right` across, from `foot` up to `top`, `out` from the wall. */
const onFace = (left: number, right: number, foot: number, top: number, out: number): Projected[] => [project(left, top, out), project(right, top, out), project(right, foot, out), project(left, foot, out)];

/**
 * How round a medal looks that is tipped forward by `tilt` from lying flat,
 * where one lying flat looks as round as `flat`: its height on the drawing
 * over its width. Tipped toward the player it shows more of its face.
 */
export const roundness = (flat: number, tilt: number): number => Math.max(0.12, Math.abs(Math.sin(Math.asin(Math.min(1, flat)) + tilt)));

/**
 * The hopper's doors, their lamps, and every medal that is on its way out of
 * them. `stampMedal` draws one medal's face at a point of the drawing, as
 * round as it is told, turned as that medal lies; `rest` is how high the
 * middle of a medal is once it is down on the pusher.
 */
export function drawHopper(
  g: CanvasRenderingContext2D,
  k: number,
  machine: Machine,
  calm: boolean,
  shift: number,
  rest: number,
  stampMedal: (point: Projected, round: number, id: number) => void,
): void {
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);
  flat();
  const swing = doorSwing(machine, calm);
  const lit = doorLampLit(machine);
  const inner = chuteShows(swing);
  const top = DOOR.foot + DOOR.tall;
  const tip = onFlap(swing, 1);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let index = 0; index < DOORS.length; index++) {
    const { from, to } = DOORS[index];
    const wide = to - from;
    // The frame the door shuts into, let into the gold of the hood.
    g.fillStyle = '#4a3206';
    trace(g, onFace(from - 0.45, to + 0.45, DOOR.foot - 0.4, top + 0.4, DOOR.face));
    g.fill();
    if (swing > 0.02) {
      // The mouth behind it: dark, and a little light on the floor of each channel where it comes out.
      const mouth = onFace(from, to, DOOR.foot, top, DOOR.face);
      const dark = g.createLinearGradient(0, mouth[0].y, 0, mouth[2].y);
      dark.addColorStop(0, '#000000');
      dark.addColorStop(0.55, '#0a0502');
      dark.addColorStop(1, lit ? '#6b4a10' : '#2a1c06');
      g.fillStyle = dark;
      trace(g, mouth);
      g.fill();
      g.strokeStyle = '#7a5a16';
      g.lineWidth = 1.1;
      for (let rib = 1; rib < POUR.channels / DOORS.length; rib++) {
        const x = from + (wide * rib) / (POUR.channels / DOORS.length);
        stroke(g, project(x, DOOR.foot, DOOR.face), project(x, DOOR.foot + DOOR.tall * 0.55, DOOR.face));
      }
    }
    // The flap: its outer side while it is up, a plate of brushed steel with an arrow for each channel; its inner side
    // once it is down, which is the chute.
    const panel = [project(from, DOOR.foot, DOOR.face), project(to, DOOR.foot, DOOR.face), project(to, tip.height, tip.depth), project(from, tip.height, tip.depth)];
    const steel = g.createLinearGradient(0, panel[0].y, 0, panel[2].y);
    if (inner) {
      steel.addColorStop(0, '#59627f');
      steel.addColorStop(0.5, '#c9d0e4');
      steel.addColorStop(1, '#f1f4fb');
    } else {
      steel.addColorStop(0, '#6f7896');
      steel.addColorStop(0.45, '#dfe4f2');
      steel.addColorStop(1, '#8d97b8');
    }
    g.fillStyle = steel;
    trace(g, panel);
    g.fill();
    g.strokeStyle = '#2b3150';
    g.lineWidth = 1;
    g.stroke();
    const each = POUR.channels / DOORS.length;
    if (inner) {
      // The walls of the channels, and the cheeks at either end.
      for (let rib = 0; rib <= each; rib++) {
        const x = from + (wide * rib) / each;
        const foot = onFlap(swing, 0.04, DOOR.rib);
        const edge = onFlap(swing, 1, DOOR.rib);
        g.strokeStyle = 'rgba(20, 24, 48, 0.55)';
        g.lineWidth = 2.6;
        stroke(g, project(x, foot.height - DOOR.rib * 0.5, foot.depth), project(x, edge.height - DOOR.rib * 0.5, edge.depth));
        g.strokeStyle = '#f7f9ff';
        g.lineWidth = 1.3;
        stroke(g, project(x, foot.height, foot.depth), project(x, edge.height, edge.depth));
      }
    } else if (swing < 0.6) {
      // An arrow on the plate for each channel, pointing the way the medals will come.
      g.fillStyle = 'rgba(43, 49, 80, 0.7)';
      for (let channel = 0; channel < each; channel++) {
        const x = from + (wide * (channel + 0.5)) / each;
        const a = onFlap(swing, 0.7);
        const b = onFlap(swing, 0.3);
        trace(g, [project(x - 1.5, a.height, a.depth), project(x + 1.5, a.height, a.depth), project(x, b.height, b.depth)]);
        g.fill();
      }
    }
    // The stays it is let down on, from the corners of its frame to its free edge.
    if (swing > 0.05) {
      g.strokeStyle = '#aab4d0';
      g.lineWidth = 1.2;
      for (const x of [from + 0.3, to - 0.3]) stroke(g, project(x, top, DOOR.face), project(x, tip.height, tip.depth));
    }
    // Its hinges, along its foot.
    for (const x of [from + DOOR.hinge.in, to - DOOR.hinge.in]) {
      const knuckle = project(x, DOOR.foot, DOOR.face + 0.2);
      const long = (DOOR.hinge.long / 2) * knuckle.scale;
      const thick = DOOR.hinge.radius * knuckle.scale;
      const chrome = g.createLinearGradient(0, knuckle.y - thick, 0, knuckle.y + thick);
      chrome.addColorStop(0, '#ffffff');
      chrome.addColorStop(0.5, '#aab4d0');
      chrome.addColorStop(1, '#343c5e');
      g.fillStyle = chrome;
      g.beginPath();
      g.ellipse(knuckle.x, knuckle.y, long, thick, 0, 0, TAU);
      g.fill();
    }
    // Its lamp, at its outer end: lit for as long as the hopper is at work.
    const lamp = project(index === 0 ? from - DOOR.lamp.out : to + DOOR.lamp.out, DOOR.foot + DOOR.tall / 2, DOOR.face);
    const size = DOOR.lamp.radius * lamp.scale;
    g.fillStyle = '#2b1c02';
    g.beginPath();
    g.arc(lamp.x, lamp.y, size * 1.35, 0, TAU);
    g.fill();
    if (lit) {
      const glow = g.createRadialGradient(lamp.x, lamp.y, size * 0.2, lamp.x, lamp.y, size * 3.2);
      glow.addColorStop(0, 'rgba(255, 196, 64, 0.75)');
      glow.addColorStop(1, 'rgba(255, 196, 64, 0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(lamp.x, lamp.y, size * 3.2, 0, TAU);
      g.fill();
    }
    const bulb = g.createRadialGradient(lamp.x - size * 0.3, lamp.y - size * 0.3, size * 0.1, lamp.x, lamp.y, size);
    bulb.addColorStop(0, lit ? '#fffbe0' : '#b08a3c');
    bulb.addColorStop(0.6, lit ? '#ffc440' : '#6a4a12');
    bulb.addColorStop(1, lit ? '#c97a00' : '#2f2006');
    g.fillStyle = bulb;
    g.beginPath();
    g.arc(lamp.x, lamp.y, size, 0, TAU);
    g.fill();
  }

  // The medals on their way out: down a channel, through the air, and the hop each lands with. The ones furthest
  // from the player first.
  let pouring: { medal: Machine['falling'][number]; pose: ReturnType<typeof pourPose> }[] | null = null;
  for (const medal of machine.falling) {
    if (medal.source !== 'pour') continue;
    (pouring ??= []).push({ medal, pose: pourPose(medal, rest, calm) });
  }
  if (pouring) {
    pouring.sort((a, b) => a.pose.depth - b.pose.depth);
    for (const { medal, pose } of pouring) {
      if (pose.shown <= 0) continue;
      const point = project(pose.x, pose.height, pose.depth);
      g.globalAlpha = pose.shown;
      stampMedal(point, roundness(point.tilt, pose.tilt), medal.id);
    }
    g.globalAlpha = 1;
  }
  flat();
}

// ── The tower tubes ─────────────────────────────────────────────────────────

/** The outline of a window's opening on the face of the wall, `out` from it: from the deck up to its top. */
const opening = (x: number, out = 0, grow = 0): Projected[] => [
  project(x - WINDOW.half - grow, WINDOW.top + grow, out),
  project(x + WINDOW.half + grow, WINDOW.top + grow, out),
  project(x + WINDOW.half + grow, DECK, out),
  project(x - WINDOW.half - grow, DECK, out),
];

/** Where the count over a window is: its plate, from its foot up, as wide as two digits want and centred over the tube. */
const countPlate = (x: number): Projected[] => {
  const foot = WINDOW.top + WINDOW.frame + 0.3;
  const top = foot + WINDOW.count.height;
  const half = WINDOW.count.half;
  return [project(x - half, top, WINDOW.count.out), project(x + half, top, WINDOW.count.out), project(x + half, foot, WINDOW.count.out), project(x - half, foot, WINDOW.count.out)];
};

/**
 * The parts of the two windows that never move, laid on the background once:
 * the dark of each recess with its jambs and its floor, the far side of the
 * glass tube standing in it, the chrome frame round the opening, which has no
 * bar at its foot since a tower goes out over the deck there, and the plate of
 * the count over it. Where the shelf and the screen were, the window is.
 */
export function paintWindows(g: CanvasRenderingContext2D, ratio: number): void {
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  for (const x of TUBE.x) {
    // The recess: its back, dark and a little lit from the top, and its jambs, which the eye sees the inside of.
    const back = opening(x, WINDOW.recess);
    const front = opening(x, 0);
    const dark = g.createLinearGradient(0, back[0].y, 0, back[2].y);
    dark.addColorStop(0, '#1b1440');
    dark.addColorStop(0.4, '#0a0720');
    dark.addColorStop(1, '#03020a');
    g.fillStyle = dark;
    trace(g, front);
    g.fill();
    g.fillStyle = 'rgba(40, 30, 90, 0.75)';
    trace(g, [front[0], front[1], back[1], back[0]]);
    g.fill();
    for (const [near, far] of [
      [0, 3],
      [1, 2],
    ] as const) {
      g.fillStyle = near === 0 ? 'rgba(70, 56, 140, 0.55)' : 'rgba(18, 12, 46, 0.8)';
      trace(g, [front[near], back[near], back[far], front[far]]);
      g.fill();
    }
    // The floor of the recess, at the deck's height: steel, with the platform's well in it.
    g.fillStyle = '#2b3150';
    trace(g, [front[3], front[2], back[2], back[3]]);
    g.fill();
    // The far half of the glass tube, a cold sheen down its back.
    const left = project(x - GLASS.radius, DECK, TUBE.back);
    const right = project(x + GLASS.radius, WINDOW.top, TUBE.back);
    const sheen = g.createLinearGradient(left.x, 0, right.x, 0);
    sheen.addColorStop(0, 'rgba(160, 220, 255, 0.16)');
    sheen.addColorStop(0.5, 'rgba(160, 220, 255, 0.04)');
    sheen.addColorStop(1, 'rgba(160, 220, 255, 0.12)');
    g.fillStyle = sheen;
    g.fillRect(left.x, right.y, right.x - left.x, left.y - right.y);
    // The frame: chrome down each side and across the top, standing as far out from the wall as the shelf from the
    // shelf up, and hardly at all below it, where the medals on the pusher lie against the wall.
    const frame = (x0: number, x1: number, top: number, foot: number, out = HOUSING.ledge + 0.1): void => {
      const face = [project(x0, top, out), project(x1, top, out), project(x1, foot, out), project(x0, foot, out)];
      const chrome = g.createLinearGradient(face[0].x, face[0].y, face[2].x, face[2].y);
      chrome.addColorStop(0, '#ffffff');
      chrome.addColorStop(0.45, '#aab4d0');
      chrome.addColorStop(1, '#4b5574');
      g.fillStyle = chrome;
      trace(g, face);
      g.fill();
    };
    const outer = WINDOW.half + WINDOW.frame;
    frame(x - outer, x - WINDOW.half, HOUSING.shelf, DECK, 0.12);
    frame(x + WINDOW.half, x + outer, HOUSING.shelf, DECK, 0.12);
    frame(x - outer, x - WINDOW.half, WINDOW.top + WINDOW.frame, HOUSING.shelf);
    frame(x + WINDOW.half, x + outer, WINDOW.top + WINDOW.frame, HOUSING.shelf);
    frame(x - outer, x + outer, WINDOW.top + WINDOW.frame, WINDOW.top);
    // The slot in the top of the opening that the medals drop in through.
    g.fillStyle = '#000000';
    trace(g, [project(x - R - 0.2, WINDOW.top, TUBE.back - 0.6), project(x + R + 0.2, WINDOW.top, TUBE.back - 0.6), project(x + R + 0.2, WINDOW.top, TUBE.back + 0.6), project(x - R - 0.2, WINDOW.top, TUBE.back + 0.6)]);
    g.fill();
    // The count's plate: dark glass in a gold rim.
    const plate = countPlate(x);
    g.fillStyle = '#07040f';
    trace(g, plate);
    g.fill();
    g.strokeStyle = '#ffd65c';
    g.lineWidth = 1.2;
    g.stroke();
  }
}

/** A column of medals standing at (x, depth) from `base` up, `stacked` of them, as `column` draws a tower; the top one's face is the tower's. */
export type Column = (x: number, depth: number, base: number, stacked: number, id: number) => void;

/**
 * What is inside each window, every frame: the platform on its stem, the
 * stack standing on it and the medal dropping onto it, and then the glass in
 * front of them, the gate with it, as far aside as it has slid. `column`
 * draws a stack, `stampMedal` one medal's face.
 */
export function drawTubes(
  g: CanvasRenderingContext2D,
  k: number,
  machine: Machine,
  front: number,
  calm: boolean,
  shift: number,
  column: Column,
  stampMedal: (point: Projected, round: number, id: number) => void,
): void {
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);
  const views = tubeViews(machine, front, calm);
  for (const view of views) {
    flat();
    const { x } = view;
    g.save();
    trace(g, opening(x, 0));
    g.clip();
    // The stem the platform stands on, and the platform: a chrome disc.
    if (view.platform > DECK + 0.05) {
      const foot = project(x, DECK, TUBE.back);
      const head = project(x, view.platform - PLATFORM.thick, TUBE.back);
      g.fillStyle = '#6f7896';
      g.fillRect(foot.x - 0.7 * foot.scale, head.y, 1.4 * foot.scale, foot.y - head.y);
    }
    const disc = project(x, view.platform - PLATFORM.thick / 2, TUBE.back);
    const rx = PLATFORM.radius * disc.scale;
    const chrome = g.createLinearGradient(disc.x - rx, 0, disc.x + rx, 0);
    chrome.addColorStop(0, '#4b5574');
    chrome.addColorStop(0.35, '#ffffff');
    chrome.addColorStop(1, '#343c5e');
    g.fillStyle = chrome;
    g.beginPath();
    g.ellipse(disc.x, disc.y, rx, rx * disc.tilt + PLATFORM.thick * rise(disc) * 0.5, 0, 0, TAU);
    g.fill();
    // The stack, from the platform up, and the medal dropping onto it.
    if (view.stacked > 0) column(x, TUBE.back, view.platform, view.stacked, (machine.stacker.made + 1) * 97 + view.index);
    if (view.dropping >= 0) {
      const top = view.platform + view.stacked * T;
      const from = WINDOW.top - 0.4;
      const height = from + (top + T / 2 - from) * view.dropping * view.dropping;
      const point = project(x, height, TUBE.back);
      stampMedal(point, Math.max(0.12, point.tilt * 0.6), view.stacked + view.index * 1000 + 7);
    }
    // The glass in front: the tube's near half, lit down its edges; the lower part of it is the gate, slid aside as far as it has gone.
    const glassFront = (from: number, to: number, slide: number): void => {
      const sideways = slide * GLASS.radius * 2.2 * (view.index === 0 ? -1 : 1);
      const a = project(x - GLASS.radius + sideways, to, TUBE.back + GLASS.radius);
      const b = project(x + GLASS.radius + sideways, from, TUBE.back + GLASS.radius);
      const pane = g.createLinearGradient(a.x, 0, b.x, 0);
      pane.addColorStop(0, 'rgba(210, 240, 255, 0.34)');
      pane.addColorStop(0.18, 'rgba(210, 240, 255, 0.08)');
      pane.addColorStop(0.32, 'rgba(255, 255, 255, 0.3)');
      pane.addColorStop(0.44, 'rgba(210, 240, 255, 0.05)');
      pane.addColorStop(0.85, 'rgba(210, 240, 255, 0.1)');
      pane.addColorStop(1, 'rgba(210, 240, 255, 0.36)');
      g.fillStyle = pane;
      g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      g.strokeStyle = 'rgba(235, 248, 255, 0.5)';
      g.lineWidth = 1;
      g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    };
    glassFront(DECK + GATE.tall, WINDOW.top, 0);
    if (view.gate < 0.999) glassFront(DECK, DECK + GATE.tall, view.gate);
    // The chrome band over the gate, round the tube.
    const band = project(x, DECK + GATE.tall, TUBE.back + GLASS.radius);
    const half = (GLASS.radius + 0.2) * band.scale;
    g.fillStyle = '#c9d0e4';
    g.fillRect(band.x - half, band.y - GATE.band * rise(band), half * 2, GATE.band * rise(band));
    g.restore();
    // The lamps at the top corners of the frame: lit while the tube is at work.
    for (const side of [-1, 1]) {
      const lamp = project(x + side * (WINDOW.half + WINDOW.frame / 2), WINDOW.top + WINDOW.frame / 2, HOUSING.ledge + 0.2);
      const r = Math.max(1.2, 0.45 * lamp.scale);
      if (view.working) {
        g.fillStyle = 'rgba(255, 196, 64, 0.45)';
        g.beginPath();
        g.arc(lamp.x, lamp.y, r * 2.6, 0, TAU);
        g.fill();
      }
      g.fillStyle = view.working ? '#fff3a8' : '#6a4a12';
      g.beginPath();
      g.arc(lamp.x, lamp.y, r, 0, TAU);
      g.fill();
    }
  }
  flat();
}

/**
 * The arms, and the towers on them: the ram coming out of its tube at the
 * deck, the boom from its head across the pusher, the plate on the boom's
 * head against the tower, and the tower itself. `tower` draws a tower where
 * it stands. Drawn once the medals on the pusher are, so that the arm and its
 * tower are over the medals they push through; and then every free tower
 * that stands nearer than the arm's tower and across it is drawn again with
 * `redraw`, since that one is in front of it.
 */
export function drawArms(g: CanvasRenderingContext2D, k: number, machine: Machine, front: number, calm: boolean, shift: number, tower: (medal: Medal) => void): void {
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);
  for (const view of tubeViews(machine, front, calm)) {
    if (view.ram === null) continue;
    flat();
    const height = DECK + ARM.height;
    const rod = (from: { x: number; y: number }, to: { x: number; y: number }, radius: number): void => {
      const a = project(from.x, height, from.y);
      const b = project(to.x, height, to.y);
      g.lineCap = 'round';
      g.strokeStyle = '#343c5e';
      g.lineWidth = radius * 2 * Math.max(a.scale, b.scale) * 1.15;
      stroke(g, a, b);
      g.strokeStyle = '#e4e8f4';
      g.lineWidth = radius * 2 * Math.min(a.scale, b.scale) * 0.55;
      stroke(g, project(from.x, height + radius * 0.35, from.y), project(to.x, height + radius * 0.35, to.y));
    };
    // The ram, from the back of the recess to its head.
    const base = { x: view.x, y: WINDOW.recess };
    const head = { x: view.x, y: view.ram };
    rod(base, head, ARM.radius * 1.4);
    let push = head;
    if (view.boom) {
      rod(head, view.boom, ARM.radius);
      push = view.boom;
    }
    // The plate on the head of whichever is out furthest, square to the way it pushes.
    const dx = push.x - head.x || 0;
    const dy = push.y - head.y || 1;
    const length = Math.hypot(dx, dy) || 1;
    const across = { x: (-dy / length) * (ARM.head / 2), y: (dx / length) * (ARM.head / 2) };
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(1.5, 0.5 * project(push.x, height, push.y).scale);
    stroke(g, project(push.x - across.x, height, push.y - across.y), project(push.x + across.x, height, push.y + across.y));
    if (view.tower) {
      tower(view.tower);
      flat();
      for (const medal of machine.medals) {
        if (medal.level === 1 && medal.stack > 1 && medal.y > view.tower.y && Math.abs(medal.x - view.tower.x) < R * 2 && !onArm(machine, medal)) tower(medal);
      }
    }
  }
  flat();
}

/**
 * The counts over the windows: how many medals are in each tube, in lamps of
 * gold on the dark of its plate, while it has a tower in it or is pushing one
 * out; at rest the plate shows its two digits unlit. Drawn on whatever lies
 * flat over the cabinet, so that the canvas and the 3D scene show the same
 * count.
 */
export function drawTubeCounts(g: CanvasRenderingContext2D, k: number, machine: Pick<Machine, 'stacker' | 'medals'>, front: number, calm: boolean, shift: number): void {
  g.setTransform(k, 0, 0, k, shift * k, 0);
  for (const view of tubeViews(machine, front, calm)) {
    const text = countText(view.count);
    const plate = countPlate(view.x);
    const middle = { x: (plate[0].x + plate[2].x) / 2, y: (plate[0].y + plate[2].y) / 2 };
    const tall = plate[3].y - plate[0].y;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${(tall * 0.92).toFixed(1)}px "Arial Black", Impact, "Avenir Next Condensed", Arial, sans-serif`;
    g.fillStyle = 'rgba(255, 196, 64, 0.13)';
    g.fillText('88', middle.x, middle.y + tall * 0.05);
    if (!text) continue;
    g.shadowColor = 'rgba(255, 196, 64, 0.9)';
    g.shadowBlur = 6 * k;
    g.fillStyle = '#ffe9a6';
    g.fillText(text, middle.x, middle.y + tall * 0.05);
    g.shadowBlur = 0;
  }
}

/** What the counts say now, to tell whether whatever they are drawn on has to be drawn again. */
export const countsShown = (machine: Pick<Machine, 'stacker' | 'medals'>, front: number, calm: boolean): string =>
  tubeViews(machine, front, calm)
    .map((view) => countText(view.count))
    .join('|');
