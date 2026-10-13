/**
 * The payout works on the canvas: the hopper's two doors in the hood's face
 * with the medals pouring out of them, and the tower lifts' guards on the
 * pusher. It draws what works.ts says is there and decides nothing. The
 * canvas renderer calls it at two places: `drawLifts` once the pusher's
 * medals are down, and `drawHopper` once the hood has been laid over
 * whatever is still inside it.
 *
 * It takes nothing from render.ts, which takes these two from it: what it
 * needs of the renderer, a medal's stamp and a tower's column, is handed in.
 */

import { MEDAL_RADIUS, type Machine, type Medal } from './engine';
import { DOORS, POUR } from './hopper';
import { DECK, DOOR, GUARD, chuteShows, doorLampLit, doorSwing, liftViews, onFlap, pourPose, type LiftView } from './works';
import { project, type Projected } from './view';

const R = MEDAL_RADIUS;
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

/** The ring in the deck round a lift's hatch and the clear sleeve that stands in it, with its collar and its lamp. */
function drawGuard(g: CanvasRenderingContext2D, view: LiftView): void {
  const foot = project(view.x, DECK + 0.05, view.y);
  const rx = GUARD.radius * foot.scale;
  const ry = rx * foot.tilt;
  // The ring: the half of it that is nearer than the tower. It is lit while the lift is at work.
  g.lineWidth = GUARD.ring * foot.scale;
  g.strokeStyle = view.working ? '#ffd65c' : '#8d97b8';
  if (view.working) {
    g.shadowColor = 'rgba(255, 214, 92, 0.9)';
    g.shadowBlur = 6;
  }
  g.beginPath();
  g.ellipse(foot.x, foot.y, rx + g.lineWidth / 2, ry + (g.lineWidth / 2) * foot.tilt, 0, 0, Math.PI);
  g.stroke();
  g.shadowBlur = 0;
  if (view.rim <= 0.05) return;
  const head = project(view.x, DECK + view.rim, view.y);
  const hx = GUARD.radius * head.scale;
  const hy = hx * head.tilt;
  // The sleeve: clear, so the tower shows through it, with the light it catches down one side.
  const glass = g.createLinearGradient(foot.x - rx, 0, foot.x + rx, 0);
  glass.addColorStop(0, 'rgba(210, 240, 255, 0.34)');
  glass.addColorStop(0.16, 'rgba(210, 240, 255, 0.1)');
  glass.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)');
  glass.addColorStop(0.42, 'rgba(210, 240, 255, 0.06)');
  glass.addColorStop(0.86, 'rgba(210, 240, 255, 0.1)');
  glass.addColorStop(1, 'rgba(210, 240, 255, 0.36)');
  g.fillStyle = glass;
  g.beginPath();
  g.moveTo(head.x - hx, head.y);
  g.lineTo(foot.x - rx, foot.y);
  g.ellipse(foot.x, foot.y, rx, ry, 0, Math.PI, 0, true);
  g.lineTo(head.x + hx, head.y);
  g.ellipse(head.x, head.y, hx, hy, 0, 0, Math.PI, true);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(235, 248, 255, 0.55)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(head.x - hx, head.y);
  g.lineTo(foot.x - rx, foot.y);
  g.moveTo(head.x + hx, head.y);
  g.lineTo(foot.x + rx, foot.y);
  g.stroke();
  // The collar round its top: the far half of its rim, then the band on the near side.
  g.strokeStyle = '#5a6384';
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(head.x, head.y, hx, hy, 0, Math.PI, TAU);
  g.stroke();
  const drop = project(view.x, DECK + Math.max(0, view.rim - GUARD.collar), view.y);
  const band = Math.max(1.5, drop.y - head.y);
  const chrome = g.createLinearGradient(head.x - hx, 0, head.x + hx, 0);
  chrome.addColorStop(0, '#4b5574');
  chrome.addColorStop(0.3, '#ffffff');
  chrome.addColorStop(0.55, '#aab4d0');
  chrome.addColorStop(1, '#343c5e');
  g.fillStyle = chrome;
  g.beginPath();
  g.ellipse(head.x, head.y, hx, hy, 0, 0, Math.PI);
  g.ellipse(head.x, head.y + band, hx, hy, 0, Math.PI, 0, true);
  g.closePath();
  g.fill();
  // Its lamp, on the front of the collar.
  const size = Math.max(1.4, 0.4 * head.scale);
  g.fillStyle = view.working ? '#ffc440' : '#6a4a12';
  if (view.working) {
    g.shadowColor = 'rgba(255, 196, 64, 0.95)';
    g.shadowBlur = 7;
  }
  g.beginPath();
  g.arc(head.x, head.y + hy + band / 2, size, 0, TAU);
  g.fill();
  g.shadowBlur = 0;
}

/**
 * The tower lifts that are at work, over the pusher's medals, from the back
 * forward. A sleeve is drawn over its own tower, which shows through it, and
 * then every tower that stands nearer than it and across it is drawn again
 * with `redraw`, since that one is in front of the sleeve.
 */
export function drawLifts(g: CanvasRenderingContext2D, k: number, machine: Machine, front: number, calm: boolean, shift: number, redraw: (tower: Medal) => void): void {
  if (machine.lifts.length === 0) return;
  const flat = () => g.setTransform(k, 0, 0, k, shift * k, 0);
  const views = liftViews(machine, front, calm);
  const reach = GUARD.radius + R;
  for (const view of views) {
    flat();
    drawGuard(g, view);
    // One of them that has a guard of its own gets it over itself again when its turn comes, which is later.
    for (const medal of machine.medals) {
      if (medal.level === 1 && medal.stack > 1 && medal.y > view.y && Math.abs(medal.x - view.x) < reach) redraw(medal);
    }
  }
  flat();
}
