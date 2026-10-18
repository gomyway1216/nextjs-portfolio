/**
 * The miniature track, as numbers: a stadium-shaped oval seen from above, in a
 * 360 × 200 picture, with six lanes (gate 1 on the rail). The horses run it
 * anticlockwise, as on the classic machines: from the gate on the far
 * straight, round the far turn, and up the home straight in front of the
 * player to the post.
 *
 * A horse's place in the race is how far it has run along the middle of the
 * track (`s`, in the picture's units), from the gate; its lane only moves it
 * across. Everything here is plain arithmetic, so that a frame of the race is
 * a handful of sums for each horse.
 */

export const VIEW = { width: 360, height: 200 } as const;
/** The middle of the oval, and the two straights' ends. */
export const CY = 100;
export const X0 = 100;
export const X1 = 260;
/** The rails: the inner one's radius and the outer one's. */
export const RAIL_IN = 50;
export const RAIL_OUT = 92;
/** Each lane's radius on the turns: gate 1 on the rail, gate 6 on the outside. */
export const LANE_FIRST = 57;
export const LANE_STEP = 5.6;
export const laneRadius = (lane: number): number => LANE_FIRST + lane * LANE_STEP;
/** The middle of the track, along which the race is measured. */
export const REF = laneRadius(2.5);
/** A horse, nose to tail, on this scale: the unit a winning margin is told in. */
export const LENGTH = 14;

/** Where the gate stands on the far straight, and the post on the home straight. */
export const START_X = 240;
export const FINISH_X = 236;

const W = X1 - X0;
const TURN = Math.PI * REF;
/** Once round the oval, along its middle. */
export const LAP = 2 * W + 2 * TURN;
/** Where the gate is, along the oval from the far straight's right-hand end. */
const START_AT = X1 - START_X;
/** How far a race is: from the gate to the post, along the middle of the track. */
export const DISTANCE = W + TURN + (FINISH_X - X0) - START_AT;
/** Where the far turn begins and where the home straight begins, as distances run. */
export const TURN_FROM = W - START_AT;
export const STRAIGHT_FROM = W + TURN - START_AT;

export interface Spot {
  x: number;
  y: number;
  /** The way the horse is heading, in degrees, 0 to the right, clockwise on screen. */
  heading: number;
}

/** Where a horse that has run `s` is, in its lane. Past the post it runs on round the oval. */
export function spotAt(s: number, lane: number): Spot {
  const r = laneRadius(lane);
  let at = (((START_AT + s) % LAP) + LAP) % LAP;
  if (at < W) return { x: X1 - at, y: CY - r, heading: 180 };
  at -= W;
  if (at < TURN) {
    const phi = at / REF;
    return { x: X0 - r * Math.sin(phi), y: CY - r * Math.cos(phi), heading: 180 - (phi * 180) / Math.PI };
  }
  at -= TURN;
  if (at < W) return { x: X0 + at, y: CY + r, heading: 0 };
  at -= W;
  const phi = at / REF;
  return { x: X1 + r * Math.sin(phi), y: CY + r * Math.cos(phi), heading: -(phi * 180) / Math.PI };
}
