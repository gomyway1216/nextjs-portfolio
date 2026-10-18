/**
 * How a roll is shown: the die tumbling in the dome, the boat hopping square
 * by square, the lamps running round the dome, the whale ride. A roll is
 * worked out in full the moment ROLL is pressed (engine.ts); this turns it
 * into the beats of its show, each a scene of the machine at a moment and the
 * sound that goes with it. The machine plays the beats one after another, and
 * a skip, or a player who asks for less motion, goes straight to the last.
 *
 * Nothing here touches React, the browser or the medals.
 */

import type { MachineSound } from '../MedalCenter/machineSounds';
import { BOARD, BOARD_SIZE, FACES, JP_LAMPS, LAMPS, LAMP_COUNT, LAP_PAYS, STAR, type ArrowKind, type Play } from './engine';

/** Where the boat is: on a square of the board, or on the whale's back (0 its tail, 1 to 10 its squares, 11 the blowhole). */
export type BoatAt = { on: 'board'; square: number } | { on: 'lane'; step: number };

/** Words over the island, as the show goes. */
export type Banner =
  | { kind: 'lap'; pays: number }
  | { kind: 'pays'; pays: number }
  | { kind: 'rest' }
  | { kind: 'arrow'; arrow: ArrowKind }
  | { kind: 'lamp' }
  | { kind: 'jp' }
  | { kind: 'final' }
  | { kind: 'jackpot'; pays: number }
  | { kind: 'ride' }
  | { kind: 'blowhole' }
  | { kind: 'times'; pays: number }
  | { kind: 'total'; pays: number }
  | { kind: 'none' };

export interface Scene {
  boat: BoatAt;
  /** The face on the die, and whether it is tumbling. */
  face: number;
  rolling: boolean;
  /** The squares of the board the boat has sailed through this roll, and of the whale's back. */
  lit: readonly number[];
  laneLit: readonly number[];
  /** The lamps round the dome: the set put up (the lamp chance's or the JP chance's), the lamp lit, and whether it has stopped. */
  lamps: { set: 'lamp' | 'jp' | null; lit: number | null; stopped: boolean };
  banner: Banner;
  /** What the roll has paid so far, per 2 medals bet: the WIN counter as the show goes. */
  paid: number;
  /** Whether START has just been passed (it flashes). */
  lapFlash: boolean;
  /** Whether the boat is put down where it is at once, not sailed there: the whirlpool's trip back to START. */
  warp: boolean;
  phase: 'idle' | 'roll' | 'sail' | 'arrow' | 'lamp' | 'jp' | 'final' | 'ride' | 'done';
}

export interface Beat {
  /** When it begins, in ms after ROLL. */
  at: number;
  scene: Scene;
  sound?: MachineSound;
}

/** How long the die tumbles, a hop takes, and the rest of the show's steps, in ms. */
export const TIMING = {
  tumble: 820,
  tumbleFace: 90,
  rideTumble: 560,
  hop: 170,
  arrowHop: 110,
  pause: 260,
  banner: 520,
  whirl: 700,
  board: 420,
  lampFirst: 40,
  lampLast: 230,
  lampLoops: 1,
  stopHold: 520,
  done: 120,
} as const;

/** A scene at rest: the boat on `square`, the die showing `face`. */
export const restingScene = (square: number, face = 1): Scene => ({
  boat: { on: 'board', square },
  face,
  rolling: false,
  lit: [],
  laneLit: [],
  lamps: { set: null, lit: null, stopped: false },
  banner: { kind: 'none' },
  paid: 0,
  lapFlash: false,
  warp: false,
  phase: 'idle',
});

/** The faces the die shows as it tumbles to `face`: a fixed run, never the same face twice in a row, ending on it. */
export function tumbleFaces(face: number, count: number): number[] {
  const out: number[] = [];
  let at = ((face + 2) % FACES) + 1;
  for (let i = 0; i < count; i++) {
    at = ((at + 1 + (i % 3)) % FACES) + 1;
    if (at === face && i === count - 1) at = (at % FACES) + 1;
    out.push(at);
  }
  return out;
}

/** The lamps lit one after another as they run: round `TIMING.lampLoops` times and on to `target`, slowing as they go. */
export function lampRun(target: number): { lamp: number; at: number }[] {
  const steps = TIMING.lampLoops * LAMP_COUNT + target + 1;
  const out: { lamp: number; at: number }[] = [];
  let t = 0;
  for (let i = 0; i < steps; i++) {
    out.push({ lamp: i % LAMP_COUNT, at: t });
    const slow = (i / (steps - 1)) ** 2.2;
    t += TIMING.lampFirst + (TIMING.lampLast - TIMING.lampFirst) * slow;
  }
  return out;
}

/** The scene the roll ends on: the boat where it rests, everything it passed lit, the chance's lamp lit, the total up. */
export function finalScene(play: Play): Scene {
  const lit = [...play.hops, ...(play.sent ? play.sent.through : [])];
  const lastFace = play.chance?.kind === 'jp' && play.chance.star ? (play.chance.final ?? play.draw.roll) : play.ride ? play.ride.steps[play.ride.steps.length - 1].roll : play.draw.roll;
  return {
    boat: { on: 'board', square: play.to },
    face: lastFace,
    rolling: false,
    lit,
    laneLit: play.ride ? play.ride.steps.flatMap((step) => step.hops) : [],
    lamps: play.chance ? { set: play.chance.kind, lit: play.chance.lamp, stopped: true } : { set: null, lit: null, stopped: false },
    banner: play.pays > 0 ? { kind: 'total', pays: play.pays } : play.landed !== play.stop || BOARD[play.stop].kind !== 'rest' ? { kind: 'none' } : { kind: 'rest' },
    paid: play.pays,
    lapFlash: false,
    warp: false,
    phase: 'done',
  };
}

/**
 * The beats of a roll's show, first to last. With `calm` (less motion asked for) there is one: the roll as it ended.
 */
export function beatsOf(play: Play, calm: boolean): Beat[] {
  if (calm) return [{ at: 0, scene: finalScene(play), sound: play.jackpot ? 'big' : play.pays > 0 ? 'win' : undefined }];
  const beats: Beat[] = [];
  let t = 0;
  let scene: Scene = { ...restingScene(play.from, play.draw.roll), phase: 'roll' };
  const push = (change: Partial<Scene>, wait: number, sound?: MachineSound) => {
    scene = { ...scene, warp: false, ...change };
    beats.push({ at: t, scene, sound });
    t += wait;
  };

  /** The die tumbling in the dome and landing on `face`. */
  const tumble = (face: number, length: number) => {
    const faces = tumbleFaces(face, Math.max(3, Math.round(length / TIMING.tumbleFace)));
    faces.forEach((shown, i) => push({ face: shown, rolling: true }, length / faces.length, i === 0 ? 'dice' : undefined));
    push({ face, rolling: false }, TIMING.pause / 2);
  };

  /** A chance played on the lamps round the dome; at the JP star, the JP FINAL. */
  const chance = () => {
    const played = play.chance!;
    const set = played.kind;
    push({ phase: set, banner: { kind: set }, lamps: { set, lit: null, stopped: false } }, TIMING.banner, 'bonus');
    const run = lampRun(played.lamp);
    for (const step of run) {
      beats.push({ at: t + step.at, scene: (scene = { ...scene, lamps: { set, lit: step.lamp, stopped: false } }), sound: step.at === 0 || step.lamp % 2 === 0 ? 'hold' : undefined });
    }
    t += run[run.length - 1].at + TIMING.lampLast;
    if (played.kind === 'jp' && played.star) {
      push({ lamps: { set, lit: played.lamp, stopped: true }, banner: { kind: 'final' }, phase: 'final' }, TIMING.banner + TIMING.pause, 'bell');
      tumble(played.final!, TIMING.tumble);
      const paid = scene.paid + played.pays;
      push({ paid, banner: played.jackpot ? { kind: 'jackpot', pays: played.pays } : { kind: 'times', pays: played.pays } }, played.jackpot ? TIMING.stopHold * 3 : TIMING.stopHold, played.jackpot ? 'big' : 'win');
      return;
    }
    const paid = scene.paid + played.pays;
    push({ paid, lamps: { set, lit: played.lamp, stopped: true }, banner: { kind: 'times', pays: played.pays } }, TIMING.stopHold, played.pays > 0 ? 'win' : undefined);
  };

  tumble(play.draw.roll, TIMING.tumble);
  push({ phase: 'sail' }, 0);
  const lit: number[] = [];
  for (const square of play.hops) {
    lit.push(square);
    const lap = square === 0;
    push({ boat: { on: 'board', square }, lit: [...lit], lapFlash: lap, ...(lap ? { paid: scene.paid + LAP_PAYS, banner: { kind: 'lap', pays: LAP_PAYS } } : {}) }, TIMING.hop, lap ? 'rung' : 'hop');
  }
  push({ lapFlash: false }, TIMING.pause);
  if (play.sent) {
    const sent = play.sent;
    push({ phase: 'arrow', banner: { kind: 'arrow', arrow: sent.kind } }, sent.kind === 'whirlpool' ? TIMING.whirl : TIMING.banner, 'launch');
    for (const square of sent.through) {
      lit.push(square);
      push({ boat: { on: 'board', square }, lit: [...lit], warp: sent.kind === 'whirlpool' }, TIMING.arrowHop, 'hop');
    }
    push({}, TIMING.pause);
  }
  const at = BOARD[play.stop];
  if (play.squarePays > 0) push({ paid: scene.paid + play.squarePays, banner: { kind: 'pays', pays: play.squarePays } }, TIMING.stopHold, 'win');
  else if (at.kind === 'rest') push({ banner: { kind: 'rest' } }, TIMING.stopHold);
  if (play.ride) {
    push({ phase: 'ride', banner: { kind: 'ride' } }, TIMING.banner, 'bonus');
    push({ boat: { on: 'lane', step: 0 } }, TIMING.board, 'splash');
    const laneLit: number[] = [];
    for (const step of play.ride.steps) {
      tumble(step.roll, TIMING.rideTumble);
      for (const hop of step.hops) {
        laneLit.push(hop);
        push({ boat: { on: 'lane', step: hop }, laneLit: [...laneLit] }, TIMING.hop, 'hop');
      }
      if (step.at !== 11 && step.pays > 0) push({ paid: scene.paid + step.pays, banner: { kind: 'pays', pays: step.pays } }, TIMING.stopHold, 'win');
    }
    if (play.ride.blowhole) {
      push({ banner: { kind: 'blowhole' } }, TIMING.banner * 1.4, 'splash');
      chance();
    }
    push({ boat: { on: 'board', square: play.to }, banner: { kind: 'none' } }, TIMING.board, 'hop');
  } else if (play.chance) chance();
  push({ ...finalScene(play), lamps: scene.lamps }, TIMING.done);
  return beats;
}

/** How long a roll's show lasts, in ms. */
export const showLength = (beats: readonly Beat[]): number => (beats.length === 0 ? 0 : beats[beats.length - 1].at + TIMING.done);

/** The lamps a set puts up round the dome, clockwise from the top: what each pays per 2 medals bet, or the JP star. */
export const lampsOf = (set: 'lamp' | 'jp'): readonly (number | typeof STAR)[] => (set === 'jp' ? JP_LAMPS : LAMPS);

/** Where each square of the board is, in cells of the board's 8 × 9 grid: START at the bottom left, the boat sailing up the left side first. */
export const COLUMNS = 8;
export const ROWS = 9;
export function cellOf(square: number): { x: number; y: number } {
  const s = ((square % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  if (s <= 8) return { x: 0, y: 8 - s };
  if (s <= 15) return { x: s - 8, y: 0 };
  if (s <= 23) return { x: 7, y: s - 15 };
  return { x: 30 - s, y: 8 };
}
