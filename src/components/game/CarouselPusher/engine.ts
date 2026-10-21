/**
 * Cherry Blossom Carousel: a single-station medal pusher whose pusher turns.
 *
 * The real thing it is built from. A pusher that pushes by turning, not by
 * sliding to and fro, is an Eagle Co. design of the 1990s (US 5,622,366, after
 * US 5,275,402): a round pusher in the middle of the field revolves round an
 * axis off its own centre, so its edge swings out and back as it turns, and the
 * medals in front of it are shoved outwards towards the edge of the field
 * wherever the bulge comes round; the player throws a medal into the gap the
 * pusher has just left. Its extra game starts from win holes in the field, each
 * under a lamp, and pays from the hopper straight into the player's tray. A
 * Japanese design of 1997 (JP H09-135962A) put a turntable on a raised stage in the
 * middle of a pusher's field, a heap of medals on it held in by pins, a three-
 * digit seven-segment counter that rolls and stops for the lottery, and, for
 * the jackpot, the turntable spun up fast with its gates open so that the heap
 * is thrown out across the field.
 *
 * This machine puts those together in a design of its own: one round body, a
 * carousel, turning steadily about a pole a little off its centre.
 *
 * - **Its skirt** is the pusher. Its edge swings out and back once a turn, so
 *   the medals lying round it on the field are shoved outwards a little at
 *   every turn where something new has come to lie against it. Medals pushed
 *   over the front edge fall into the player's tray; near the front, the sides
 *   are open, and what goes over them, or over either end of the front edge,
 *   goes down the side holes.
 * - **Its deck** is the turntable. The rail drops the player's medal onto it,
 *   always at the same spot in front of the pole (`DROP`). Three holes ride
 *   round on a ring about the pole (`POCKETS`): a medal that comes down in one
 *   of them, or rolls into one as it slides off the deck, starts the counter.
 *   The deck slopes down from the pole, so a medal that misses slides off its
 *   edge onto the field, at the foot of the skirt, where the next swing of the
 *   bulge pushes it into the heap. The holes come round under the rail three
 *   times a turn: the skill of the machine is timing, a medal dropped as a hole
 *   comes round.
 * - **The pole** carries the treasure dish, where the machine keeps its stock
 *   of medals: it starts at `STOCK.start` and the hopper adds one for every
 *   `STOCK.every` medals fed. 7-7-7 on the counter tips the dish, and the stock
 *   is thrown out across the field (`fling`), where the pusher works it off.
 * - **The counter** (lottery.ts) pays its other prizes straight into the tray,
 *   as Eagle's did.
 *
 * Nothing moves unless something pushes it, so the field is worked out by
 * moving the medals apart where they overlap (position-based, with friction),
 * not by integrating speeds. The machine draws its random numbers from a
 * seeded generator and from the numbers each press brings (`press`), keeps
 * time in whole steps of 1/60 s, and uses no sine, cosine or square root other
 * than `Math.sqrt` (which every browser rounds the same way), so a given state
 * and the same presses play out the same in every browser and in the tests.
 */

// ── Deterministic arithmetic ────────────────────────────────────────────────

/** Steps a second, and steps a turn of the carousel: a turn every six seconds, a degree a step. */
export const STEP_RATE = 60;
export const TURN_STEPS = 360;
export const STEP_SECONDS = 1 / STEP_RATE;

/**
 * Sine and cosine of whole degrees, by their series on an angle no wider than 45°: only additions,
 * multiplications and divisions, which every JavaScript engine rounds the same way. `Math.sin` and `Math.cos`
 * are allowed to differ in the last bit from one engine to the next, and the field would play differently.
 */
function seriesSin(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 10; n++) {
    term = (-term * x2) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}
function seriesCos(x: number): number {
  const x2 = x * x;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 10; n++) {
    term = (-term * x2) / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}
const DEGREE = 3.141592653589793 / 180;
function degreeTrig(deg: number): [number, number] {
  // Folded into the first octant, where the series is short and exact to the last bit or two.
  const d = ((deg % 360) + 360) % 360;
  const quadrant = Math.floor(d / 90);
  const within = d - quadrant * 90;
  const [c0, s0] = within <= 45 ? [seriesCos(within * DEGREE), seriesSin(within * DEGREE)] : [seriesSin((90 - within) * DEGREE), seriesCos((90 - within) * DEGREE)];
  switch (quadrant) {
    case 0:
      return [c0, s0];
    case 1:
      return [-s0, c0];
    case 2:
      return [-c0, -s0];
    default:
      return [s0, -c0];
  }
}
/** Cosine and sine of each whole degree, 0 to 359. */
export const COS = new Float64Array(360);
export const SIN = new Float64Array(360);
for (let d = 0; d < 360; d++) {
  const [c, s] = degreeTrig(d);
  COS[d] = c;
  SIN[d] = s;
}

/** The carousel's angle at a step, in whole degrees (`TURN_STEPS` is 360: a degree a step). */
export const angleAt = (step: number): number => ((step % TURN_STEPS) + TURN_STEPS) % TURN_STEPS;

/** A generator of random numbers from a 32-bit state (mulberry32): the same numbers in every engine. */
export function nextRandom(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── The cabinet ─────────────────────────────────────────────────────────────

/** Distances are in medal radii: a medal is 2 across. */
export const MEDAL_RADIUS = 1;

/**
 * The field is a fan: one station's share of a round machine, as on Eagle's, where the partitions between the
 * stations run straight out from the pusher. Its two side walls run out from the pole, `spread` degrees either side
 * of straight ahead, to the front edge, `depth` from the back of the cabinet; so the carousel pushes the medals along
 * them, not into them, and a narrow lane of medals is never jammed against a wall. The front edge is `width` across,
 * from corner to corner.
 */
const SPREAD = 36;
const DEPTH = 28;
const POLE_Y = 5;
const HALF_FRONT = ((DEPTH - POLE_Y) * SIN[SPREAD]) / COS[SPREAD];

export const FIELD = {
  /** The front edge, from the back of the cabinet. */
  depth: DEPTH,
  /** How far either side wall leans out from straight ahead, in degrees. */
  spread: SPREAD,
  /** The front edge, corner to corner. The field's left corner is at x = 0. */
  width: 2 * HALF_FRONT,
  /**
   * How far each side hole reaches in from its front corner, along the front edge: a medal that goes over the front
   * within this of either corner goes down the side hole there. It sets what the field gives back (lottery.ts says how
   * the machine's return is made up), as the width of the side holes does on a real machine.
   */
  sideReach: 4.5,
} as const;

/** The pole the carousel turns about: in the middle, near the back of the cabinet. */
export const AXIS = { x: HALF_FRONT, y: POLE_Y } as const;

/** The side walls: the way each runs out from the pole (degrees), and the way that points into the field from it. */
export const WALLS = [
  { deg: 90 - SPREAD, nx: -SIN[90 - SPREAD], ny: COS[90 - SPREAD] },
  { deg: 90 + SPREAD, nx: SIN[90 + SPREAD], ny: -COS[90 + SPREAD] },
] as const;

/**
 * The carousel. Its body is round, `radius` across from its centre, and its centre is `offset` from the pole, so as it
 * turns its edge swings out and back by twice that. Its deck stands `height` above the field.
 */
export const CAROUSEL = { radius: 6.5, offset: 2, height: 3.2 } as const;
/** How far from the pole the carousel's edge ever reaches: nothing lying further out is ever touched by it. */
export const REACH = CAROUSEL.radius + CAROUSEL.offset;

/** The ring of holes on the deck: its radius about the pole, and each hole's place on it (degrees, on the deck). */
export const RING = 3.2;
export const POCKETS = [90, 210, 330] as const;
/**
 * The holes' sizes: each is `mouth` across from its middle, a little wider than a medal. A medal that comes down with
 * its middle over a hole tips into it. One that comes down inside the ring and slides out over a hole goes in if it
 * passes within `roll` of its middle: it is moving, and rides over the near side of the hole more easily.
 */
export const POCKET = { mouth: 1.15, roll: 0.8 } as const;

/** Where the rail drops a medal onto the deck: on the ring, straight in front of the pole. */
export const DROP = { x: AXIS.x, y: AXIS.y + RING } as const;
/** How far from the drop spot a medal may come down: anywhere in a disc this wide, drawn at the press. */
export const SCATTER = 2.1;

/** Times, in steps. */
export const TIMES = {
  /** From the press to the medal leaving the rail's tip: in at the slot, and along the rail. */
  rail: 42,
  /** From the tip to the deck. */
  drop: 12,
  /** From the deck's edge to the field. */
  off: 13,
  /** Down a hole, out of sight. */
  pocket: 10,
  /** The fewest steps between two medals into the slot: a press sooner waits. */
  gap: 15,
  /** A medal thrown out of the dish is in the air this long. */
  fling: 32,
  /** Steps between two medals thrown out of the dish. */
  flingEvery: 2,
  /** A medal landing on the field takes this long to take its full room among the others. */
  grow: 18,
} as const;
/** How fast a medal slides off the deck, in medal radii a second. */
export const SLIDE_SPEED = 10;

/** The press to the deck, in steps: what a player times a medal by. */
export const PRESS_TO_DECK = TIMES.rail + TIMES.drop;

/** The treasure dish's stock: what it starts with after a jackpot, and how many medals fed add one to it. */
export const STOCK = { start: 60, every: 8, most: 9_999 } as const;

/** Spins waiting at most, as four hold lamps. A medal into a hole while all four are lit starts nothing. */
export const HOLD_MAX = 4;
/** Medals on the field at most: the field is never fuller than this, and a save never holds more. */
export const FIELD_MOST = 400;
/** Medals in the air at most (on the rail, falling, sliding, thrown). */
export const AIR_MOST = 600;

// ── The physics ────────────────────────────────────────────────────────────

/** Passes of moving overlapping medals apart, each step. */
const PASSES = 4;
/** Friction: medal on medal (holding, and sliding), medal on a wall, and the carousel's skirt dragging a medal. */
const FRICTION = { stick: 0.6, slide: 0.45, wall: 0.4, skirt: 0.35 } as const;
/** A landing medal starts with this share of its room. */
const GROW_FROM = 0.3;

// ── The machine ─────────────────────────────────────────────────────────────

/** A medal in the air: on the rail, falling to the deck, sliding off it, down a hole, falling to the field, or thrown. */
export type Air =
  /** On its way down the rail, to leave the tip at `at`, and come down `dx`, `dy` from the drop spot. */
  | { k: 'rail'; id: number; from: number; at: number; dx: number; dy: number }
  /** Falling from the tip to the deck, onto `x`, `y`, at `at`. */
  | { k: 'drop'; id: number; from: number; at: number; x: number; y: number }
  /**
   * Sliding on the deck from `qx`, `qy` to `ex`, `ey` (on the deck: about the pole, turned back by the carousel's
   * angle), arriving at `at`; into hole `pocket` there, or off the edge when it is -1. `direct`: it came down in the
   * hole.
   */
  | { k: 'slide'; id: number; from: number; at: number; qx: number; qy: number; ex: number; ey: number; pocket: number; direct: boolean }
  /** Falling from the deck's edge at `sx`, `sy` to the field at `x`, `y`, arriving at `at`. */
  | { k: 'off'; id: number; from: number; at: number; sx: number; sy: number; x: number; y: number }
  /** Thrown out of the treasure dish, landing at `x`, `y` at `at`. */
  | { k: 'fling'; id: number; from: number; at: number; x: number; y: number };

/** The counter's spin in hand: what it comes to, and when it stops. The lottery (lottery.ts) says what each is. */
export interface Spin {
  /** The outcome's index in `OUTCOMES` (lottery.ts), and the three digits it shows. */
  outcome: number;
  digits: [number, number, number];
  from: number;
  /** When each digit stops, in steps from `from`. */
  stops: [number, number, number];
  /** When it pays and is over. */
  at: number;
}

export interface Machine {
  /** Steps since the machine was set up. Its angle is `angleAt(step)`. */
  step: number;
  /** The field's medals: middles, as x, y pairs, the room each has taken (1 when grown), and a name each. */
  xy: number[];
  grow: number[];
  ids: number[];
  air: Air[];
  /** Spins waiting (the hold lamps), and the one in hand. */
  holds: number;
  spin: Spin | null;
  /** Steps until the next spin may start: a moment between two. */
  rest: number;
  /** Numbers drawn at the presses, for the next spins' outcomes, the next first. */
  tickets: number[];
  stock: number;
  /** Medals fed since the stock last grew. */
  toStock: number;
  /** Medals still to be thrown out of the dish, and when the next one goes. */
  fling: number;
  flingAt: number;
  /** The seeded generator's state: what the machine draws for itself. */
  rng: number;
  nextId: number;
  /** When the slot next takes a medal. */
  slotAt: number;
  /** Medals in the tray not yet counted into the player's medals. */
  tray: number;
  /** Steps in a row nothing on the field has moved. */
  quiet: number;
}

export type MachineEvent =
  | { type: 'fed'; id: number }
  | { type: 'deck'; id: number; x: number; y: number }
  | { type: 'pocket'; id: number; pocket: number; direct: boolean; held: boolean }
  | { type: 'off'; id: number }
  | { type: 'land'; id: number; x: number; y: number }
  | { type: 'won'; count: number; via: 'front' | 'fling' }
  | { type: 'lost'; count: number }
  | { type: 'stock'; stock: number }
  | { type: 'spin'; spin: Spin }
  | { type: 'stop'; place: number; digit: number }
  | { type: 'paid'; outcome: number; medals: number }
  | { type: 'jackpot'; medals: number }
  | { type: 'thrown'; id: number };

/** A machine with nothing on its field yet: the start of `freshMachine`. */
export function emptyMachine(seed: number): Machine {
  return {
    step: 0,
    xy: [],
    grow: [],
    ids: [],
    air: [],
    holds: 0,
    spin: null,
    rest: 0,
    tickets: [],
    stock: STOCK.start,
    toStock: 0,
    fling: 0,
    flingAt: 0,
    rng: seed | 0,
    nextId: 1,
    slotAt: 0,
    tray: 0,
    quiet: 0,
  };
}

export const copyMachine = (m: Machine): Machine => ({
  ...m,
  xy: m.xy.slice(),
  grow: m.grow.slice(),
  ids: m.ids.slice(),
  air: m.air.map((a) => ({ ...a })),
  spin: m.spin ? { ...m.spin, digits: [...m.spin.digits] as Spin['digits'], stops: [...m.spin.stops] as Spin['stops'] } : null,
  tickets: m.tickets.slice(),
});

/** The carousel's centre at a step. */
export function carouselCentre(step: number): { x: number; y: number } {
  const a = angleAt(step);
  return { x: AXIS.x + CAROUSEL.offset * COS[a], y: AXIS.y + CAROUSEL.offset * SIN[a] };
}

/** A hole's place on the field at a step. */
export function pocketAt(pocket: number, step: number): { x: number; y: number } {
  const a = (POCKETS[pocket] + angleAt(step)) % 360;
  return { x: AXIS.x + RING * COS[a], y: AXIS.y + RING * SIN[a] };
}

/** A point on the deck (about the pole, turned back by the carousel's angle at `step`) on the field. */
export function deckToField(qx: number, qy: number, step: number): { x: number; y: number } {
  const a = angleAt(step);
  return { x: AXIS.x + qx * COS[a] - qy * SIN[a], y: AXIS.y + qx * SIN[a] + qy * COS[a] };
}
/** A point on the field, on the deck at `step`. */
export function fieldToDeck(x: number, y: number, step: number): { qx: number; qy: number } {
  const a = angleAt(step);
  const dx = x - AXIS.x;
  const dy = y - AXIS.y;
  return { qx: dx * COS[a] + dy * SIN[a], qy: -dx * SIN[a] + dy * COS[a] };
}

/**
 * Steps from `step` until the next hole is under the drop spot, and which hole: what a player who times a medal
 * waits for. The holes pass under it three times a turn.
 */
export function nextPocketUnderDrop(step: number): { pocket: number; steps: number } {
  // The drop spot is at 90° on the field; hole k is there when its place on the deck plus the angle is 90°.
  const a = angleAt(step);
  let best = { pocket: 0, steps: TURN_STEPS };
  POCKETS.forEach((deg, pocket) => {
    const wait = (((90 - deg - a) % 360) + 360) % 360;
    if (wait < best.steps) best = { pocket, steps: wait };
  });
  return best;
}

// ── Feeding ─────────────────────────────────────────────────────────────────

/**
 * A medal into the slot. `u`, `v` are random numbers drawn at the press: where on the deck it comes down, off the drop
 * spot (anywhere in a disc `SCATTER` wide, every spot as likely). `ticket` is a third, kept for a coming spin. The slot
 * takes a medal every `TIMES.gap` steps: a press sooner is taken when the slot is free (the medal waits its turn).
 */
export function feed(m: Machine, u: number, v: number, ticket: number, events?: MachineEvent[]): number {
  const id = m.nextId++;
  const at = Math.max(m.step, m.slotAt);
  m.slotAt = at + TIMES.gap;
  const deg = Math.min(359, Math.floor(u * 360));
  const r = SCATTER * Math.sqrt(Math.min(1, Math.max(0, v)));
  m.air.push({ k: 'rail', id, from: at, at: at + TIMES.rail, dx: r * COS[deg], dy: r * SIN[deg] });
  if (m.tickets.length < 16) m.tickets.push(ticket);
  m.toStock += 1;
  if (m.toStock >= STOCK.every) {
    m.toStock = 0;
    if (m.stock < STOCK.most) {
      m.stock += 1;
      events?.push({ type: 'stock', stock: m.stock });
    }
  }
  events?.push({ type: 'fed', id });
  return id;
}

/** Whether the slot would take a medal at once. */
export const slotFree = (m: Machine): boolean => m.slotAt <= m.step;

/** Where a medal that came down on the deck at `x`, `y` (field) at `step` goes: into a hole, or off the edge. */
export function slideOf(x: number, y: number, step: number): { qx: number; qy: number; ex: number; ey: number; pocket: number; direct: boolean; steps: number } {
  const { qx, qy } = fieldToDeck(x, y, step);
  // Came down in a hole.
  for (let k = 0; k < POCKETS.length; k++) {
    const px = RING * COS[POCKETS[k]];
    const py = RING * SIN[POCKETS[k]];
    const dx = qx - px;
    const dy = qy - py;
    if (dx * dx + dy * dy < POCKET.mouth * POCKET.mouth) return { qx, qy, ex: px, ey: py, pocket: k, direct: true, steps: TIMES.pocket };
  }
  const q = Math.sqrt(qx * qx + qy * qy);
  // Straight out from the pole: the deck slopes down from it. (A medal never comes down on the pole itself.)
  const ux = q > 1e-9 ? qx / q : 0;
  const uy = q > 1e-9 ? qy / q : 1;
  if (q < RING) {
    const cx = RING * ux;
    const cy = RING * uy;
    for (let k = 0; k < POCKETS.length; k++) {
      const dx = cx - RING * COS[POCKETS[k]];
      const dy = cy - RING * SIN[POCKETS[k]];
      if (dx * dx + dy * dy < POCKET.roll * POCKET.roll) {
        const steps = Math.max(1, Math.round(((RING - q) / SLIDE_SPEED) * STEP_RATE));
        return { qx, qy, ex: RING * COS[POCKETS[k]], ey: RING * SIN[POCKETS[k]], pocket: k, direct: false, steps };
      }
    }
  }
  // Off the edge of the deck: where the line out from the pole meets the carousel's rim, whose centre is
  // `CAROUSEL.offset` along the deck's x axis from the pole.
  const ox = qx - CAROUSEL.offset;
  const b = ox * ux + qy * uy;
  const c = ox * ox + qy * qy - CAROUSEL.radius * CAROUSEL.radius;
  const s = -b + Math.sqrt(Math.max(0, b * b - c));
  const ex = qx + s * ux;
  const ey = qy + s * uy;
  return { qx, qy, ex, ey, pocket: -1, direct: false, steps: Math.max(1, Math.round((s / SLIDE_SPEED) * STEP_RATE)) };
}

// ── The physics of the field ────────────────────────────────────────────────

/** Working arrays, reused from step to step. */
const work = {
  px: new Float64Array(FIELD_MOST + 64),
  py: new Float64Array(FIELD_MOST + 64),
  pairs: new Int32Array(16 * (FIELD_MOST + 64)),
  cellStart: new Int32Array(1),
  cellNext: new Int32Array(FIELD_MOST + 64),
};
const CELL = 2.25;
const GRID_X0 = -4;
const GRID_Y0 = -4;
const GRID_W = Math.ceil((FIELD.width + 8) / CELL);
const GRID_H = Math.ceil((FIELD.depth + 8) / CELL);
work.cellStart = new Int32Array(GRID_W * GRID_H);

const cellOf = (x: number, y: number): number => {
  const cx = Math.min(GRID_W - 1, Math.max(0, Math.floor((x - GRID_X0) / CELL)));
  const cy = Math.min(GRID_H - 1, Math.max(0, Math.floor((y - GRID_Y0) / CELL)));
  return cy * GRID_W + cx;
};

/** Pairs of medals near enough to touch this step, found once a step. */
function findPairs(xy: number[], n: number): number {
  const start = work.cellStart;
  start.fill(-1);
  for (let i = 0; i < n; i++) {
    const c = cellOf(xy[2 * i], xy[2 * i + 1]);
    work.cellNext[i] = start[c];
    start[c] = i;
  }
  let count = 0;
  const reach2 = CELL * CELL;
  const capacity = work.pairs.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = xy[2 * i];
    const y = xy[2 * i + 1];
    const cx = Math.min(GRID_W - 1, Math.max(0, Math.floor((x - GRID_X0) / CELL)));
    const cy = Math.min(GRID_H - 1, Math.max(0, Math.floor((y - GRID_Y0) / CELL)));
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(GRID_H - 1, cy + 1); gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(GRID_W - 1, cx + 1); gx++) {
        for (let j = start[gy * GRID_W + gx]; j >= 0; j = work.cellNext[j]) {
          if (j <= i) continue;
          const dx = xy[2 * j] - x;
          const dy = xy[2 * j + 1] - y;
          if (dx * dx + dy * dy < reach2 && count < capacity) {
            work.pairs[2 * count] = i;
            work.pairs[2 * count + 1] = j;
            count++;
          }
        }
      }
    }
  }
  return count;
}

/** Moves the field's medals as the carousel turns one step on: the skirt shoves, overlapping medals move apart. */
function pushField(m: Machine): number {
  const n = m.ids.length;
  const { xy, grow } = m;
  const { px, py } = work;
  for (let i = 0; i < n; i++) {
    px[i] = xy[2 * i];
    py[i] = xy[2 * i + 1];
  }
  const pairs = findPairs(xy, n);
  const a = angleAt(m.step);
  const prev = angleAt(m.step - 1);
  const cx = AXIS.x + CAROUSEL.offset * COS[a];
  const cy = AXIS.y + CAROUSEL.offset * SIN[a];
  // How far a point of the skirt moves this step, as a turn about the pole: (cos, sin) of the step's angle less one.
  const turnC = COS[(a - prev + 360) % 360] - 1;
  const turnS = SIN[(a - prev + 360) % 360];
  for (let pass = 0; pass < PASSES; pass++) {
    // The skirt: a medal inside it is pushed straight out from its centre, and dragged along as the skirt turns.
    for (let i = 0; i < n; i++) {
      const r = MEDAL_RADIUS * grow[i];
      const dx = xy[2 * i] - cx;
      const dy = xy[2 * i + 1] - cy;
      const need = CAROUSEL.radius + r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= need * need) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-9 ? dx / d : 0;
      const ny = d > 1e-9 ? dy / d : 1;
      const depth = need - d;
      xy[2 * i] += nx * depth;
      xy[2 * i + 1] += ny * depth;
      if (pass === 0) {
        // The skirt's point of touch moves with the turn; the medal is dragged along it as far as friction holds it.
        const tx = cx + nx * CAROUSEL.radius - AXIS.x;
        const ty = cy + ny * CAROUSEL.radius - AXIS.y;
        const sx = tx * turnC - ty * turnS;
        const sy = tx * turnS + ty * turnC;
        const along = -ny * sx + nx * sy;
        const most = FRICTION.skirt * depth;
        const drag = along > most ? most : along < -most ? -most : along;
        xy[2 * i] += -ny * drag;
        xy[2 * i + 1] += nx * drag;
      }
    }
    // Medal on medal: moved apart along the line between their middles, half each; held from sliding past each other.
    for (let p = 0; p < pairs; p++) {
      const i = work.pairs[2 * p];
      const j = work.pairs[2 * p + 1];
      const dx = xy[2 * j] - xy[2 * i];
      const dy = xy[2 * j + 1] - xy[2 * i + 1];
      const need = MEDAL_RADIUS * (grow[i] + grow[j]);
      const d2 = dx * dx + dy * dy;
      if (d2 >= need * need) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-9 ? dx / d : 1;
      const ny = d > 1e-9 ? dy / d : 0;
      const depth = need - d;
      const half = depth * 0.5;
      xy[2 * i] -= nx * half;
      xy[2 * i + 1] -= ny * half;
      xy[2 * j] += nx * half;
      xy[2 * j + 1] += ny * half;
      // How far the two have slid past each other this step, across the line between them.
      const rx = xy[2 * j] - px[j] - (xy[2 * i] - px[i]);
      const ry = xy[2 * j + 1] - py[j] - (xy[2 * i + 1] - py[i]);
      const slip = -ny * rx + nx * ry;
      const hold = FRICTION.stick * depth;
      const give = slip > hold || slip < -hold ? (slip > 0 ? FRICTION.slide * depth : -FRICTION.slide * depth) : slip;
      const g = give * 0.5;
      xy[2 * i] += -ny * g;
      xy[2 * i + 1] += nx * g;
      xy[2 * j] -= -ny * g;
      xy[2 * j + 1] -= nx * g;
    }
    // The side walls: a medal is kept inside both, and held from sliding along a wall it is pressed against.
    for (let i = 0; i < n; i++) {
      const r = MEDAL_RADIUS * grow[i];
      for (let w = 0; w < 2; w++) {
        const wall = WALLS[w];
        const ox = xy[2 * i] - AXIS.x;
        const oy = xy[2 * i + 1] - AXIS.y;
        const inside = ox * wall.nx + oy * wall.ny;
        if (inside >= r) continue;
        const depth = r - inside;
        xy[2 * i] += wall.nx * depth;
        xy[2 * i + 1] += wall.ny * depth;
        const slip = (xy[2 * i] - px[i]) * wall.ny - (xy[2 * i + 1] - py[i]) * wall.nx;
        const hold = FRICTION.wall * depth;
        const back = slip > hold ? hold : slip < -hold ? -hold : slip;
        xy[2 * i] -= wall.ny * back;
        xy[2 * i + 1] += wall.nx * back;
      }
    }
  }
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(xy[2 * i] - px[i]) + Math.abs(xy[2 * i + 1] - py[i]);
    if (d > moved) moved = d;
  }
  return moved;
}

/** Whether a medal whose middle is at `x` going over the front edge drops into the tray, not down a side hole. */
export const frontPays = (x: number): boolean => x >= FIELD.sideReach && x <= FIELD.width - FIELD.sideReach;

/** Whether a point lies inside the field's side walls (a medal of radius `r` there touches neither). */
export function insideWalls(x: number, y: number, r = 0): boolean {
  return WALLS.every((wall) => (x - AXIS.x) * wall.nx + (y - AXIS.y) * wall.ny >= r);
}

/** Takes medal `i` off the field (the last one takes its place). */
function removeAt(m: Machine, i: number): void {
  const last = m.ids.length - 1;
  if (i !== last) {
    m.xy[2 * i] = m.xy[2 * last];
    m.xy[2 * i + 1] = m.xy[2 * last + 1];
    m.grow[i] = m.grow[last];
    m.ids[i] = m.ids[last];
  }
  m.xy.length -= 2;
  m.grow.length -= 1;
  m.ids.length -= 1;
}

/** Medals whose middles have gone over an edge: into the tray, or down a side hole. */
function dropOver(m: Machine, events?: MachineEvent[]): void {
  let won = 0;
  let lost = 0;
  for (let i = m.ids.length - 1; i >= 0; i--) {
    const x = m.xy[2 * i];
    const y = m.xy[2 * i + 1];
    if (y > FIELD.depth) {
      if (frontPays(x)) won++;
      else lost++;
      removeAt(m, i);
    }
  }
  if (won > 0) {
    m.tray += won;
    events?.push({ type: 'won', count: won, via: 'front' });
  }
  if (lost > 0) events?.push({ type: 'lost', count: lost });
}

/** Puts a medal down on the field, with a little of its room to begin with. */
function land(m: Machine, id: number, x: number, y: number, events?: MachineEvent[]): void {
  if (m.ids.length >= FIELD_MOST) {
    // The field cannot be fuller: the medal goes down a side hole. Never reached in play.
    events?.push({ type: 'lost', count: 1 });
    return;
  }
  m.xy.push(x, y);
  m.grow.push(GROW_FROM);
  m.ids.push(id);
  events?.push({ type: 'land', id, x, y });
}

// ── The lottery's hooks (lottery.ts fills them in) ─────────────────────────

/** What the machine needs of the lottery: a spin from a number, and what an outcome pays. */
export interface Lottery {
  spinFrom(ticket: number, step: number): Spin;
  /** Medals an outcome pays into the tray; `null` for the jackpot, which tips the dish. */
  prize(outcome: number): number | null;
}

/** Starts the next spin when the counter is free. */
function startSpin(m: Machine, lottery: Lottery, events?: MachineEvent[]): void {
  if (m.spin || m.holds <= 0 || m.rest > 0) return;
  m.holds -= 1;
  const ticket = m.tickets.length > 0 ? m.tickets.shift()! : nextRandom(m);
  m.spin = lottery.spinFrom(ticket, m.step);
  events?.push({ type: 'spin', spin: m.spin });
}

/** The machine one step on. */
export function step(m: Machine, lottery: Lottery, events?: MachineEvent[]): void {
  m.step += 1;
  const now = m.step;

  // The air: medals reaching the next part of their way.
  if (m.air.length > 0) {
    const still: Air[] = [];
    // Medals that come to the field this step, put down after the others are moved.
    for (const a of m.air) {
      if (a.at > now) {
        still.push(a);
        continue;
      }
      switch (a.k) {
        case 'rail': {
          still.push({ k: 'drop', id: a.id, from: now, at: now + TIMES.drop, x: DROP.x + a.dx, y: DROP.y + a.dy });
          break;
        }
        case 'drop': {
          const centre = carouselCentre(now);
          const ox = a.x - centre.x;
          const oy = a.y - centre.y;
          const o = Math.sqrt(ox * ox + oy * oy);
          if (o > CAROUSEL.radius) {
            // Past the deck's edge (the bulge had swung away): straight down beside the skirt.
            const out = (CAROUSEL.radius + MEDAL_RADIUS * 1.15) / o;
            still.push({ k: 'off', id: a.id, from: now, at: now + TIMES.off, sx: a.x, sy: a.y, x: centre.x + ox * out, y: centre.y + oy * out });
            events?.push({ type: 'off', id: a.id });
            break;
          }
          events?.push({ type: 'deck', id: a.id, x: a.x, y: a.y });
          const s = slideOf(a.x, a.y, now);
          still.push({ k: 'slide', id: a.id, from: now, at: now + s.steps, qx: s.qx, qy: s.qy, ex: s.ex, ey: s.ey, pocket: s.pocket, direct: s.direct });
          break;
        }
        case 'slide': {
          if (a.pocket >= 0) {
            const held = m.holds < HOLD_MAX;
            if (held) m.holds += 1;
            events?.push({ type: 'pocket', id: a.id, pocket: a.pocket, direct: a.direct, held });
          } else {
            // Over the rim and down the skirt, a little out from it.
            const rim = deckToField(a.ex, a.ey, now);
            const centre = carouselCentre(now);
            const ox = rim.x - centre.x;
            const oy = rim.y - centre.y;
            const o = Math.sqrt(ox * ox + oy * oy) || 1;
            const out = MEDAL_RADIUS * 1.15;
            still.push({ k: 'off', id: a.id, from: now, at: now + TIMES.off, sx: rim.x, sy: rim.y, x: rim.x + (ox / o) * out, y: rim.y + (oy / o) * out });
            events?.push({ type: 'off', id: a.id });
          }
          break;
        }
        case 'off':
        case 'fling': {
          if (a.y > FIELD.depth) {
            if (frontPays(a.x)) {
              m.tray += 1;
              events?.push({ type: 'won', count: 1, via: 'fling' });
            } else events?.push({ type: 'lost', count: 1 });
          } else if (!insideWalls(a.x, a.y)) {
            // Behind a side wall: into the cabinet, where the hopper takes it.
            events?.push({ type: 'lost', count: 1 });
          } else land(m, a.id, a.x, a.y, events);
          break;
        }
      }
    }
    m.air = still;
  }

  // The treasure dish, while a jackpot throws its stock: a medal every `TIMES.flingEvery` steps, and a pause whenever
  // the field is too full to take more (the stock waits in the dish; none of it is lost).
  if (m.fling > 0 && now >= m.flingAt && m.ids.length + m.air.length < FIELD_MOST - 40) {
    m.fling -= 1;
    m.flingAt = now + TIMES.flingEvery;
    // Out across the field between its side walls, as far as the front edge and a little over it, into the tray.
    const deg = 90 + Math.floor((nextRandom(m) - 0.5) * 2 * (FIELD.spread - 4));
    const d = REACH + MEDAL_RADIUS + nextRandom(m) * (FIELD.depth - AXIS.y - REACH + 1);
    const a = ((deg % 360) + 360) % 360;
    const id = m.nextId++;
    m.air.push({ k: 'fling', id, from: now, at: now + TIMES.fling, x: AXIS.x + d * COS[a], y: AXIS.y + d * SIN[a] });
    events?.push({ type: 'thrown', id });
  }

  // The field.
  for (let i = 0; i < m.grow.length; i++) {
    if (m.grow[i] < 1) m.grow[i] = Math.min(1, m.grow[i] + (1 - GROW_FROM) / TIMES.grow);
  }
  const moved = m.ids.length > 0 ? pushField(m) : 0;
  dropOver(m, events);
  m.quiet = moved < 1e-6 ? m.quiet + 1 : 0;

  // The counter.
  if (m.rest > 0) m.rest -= 1;
  if (m.spin) {
    const spin = m.spin;
    for (let place = 0; place < 3; place++) {
      if (now === spin.from + spin.stops[place]) events?.push({ type: 'stop', place, digit: spin.digits[place] });
    }
    if (now >= spin.at) {
      const medals = lottery.prize(spin.outcome);
      if (medals === null) {
        events?.push({ type: 'jackpot', medals: m.stock });
        m.fling += m.stock;
        m.flingAt = now + 20;
        m.stock = STOCK.start;
        events?.push({ type: 'stock', stock: m.stock });
      } else {
        m.tray += medals;
        events?.push({ type: 'paid', outcome: spin.outcome, medals });
      }
      m.spin = null;
      m.rest = 15;
    }
  }
  startSpin(m, lottery, events);
}

/**
 * Whether the machine stands still and will go on doing so however long it turns unplayed: nothing in the air,
 * nothing on the counter, nothing to throw, the field still, and no medal within reach of the skirt. Then
 * `idle` can turn it on without working out the steps.
 */
export function atRest(m: Machine): boolean {
  if (m.air.length > 0 || m.spin || m.holds > 0 || m.fling > 0 || m.quiet < 30) return false;
  const reach = REACH + MEDAL_RADIUS - 1e-3;
  for (let i = 0; i < m.ids.length; i++) {
    if (m.grow[i] < 1) return false;
    const dx = m.xy[2 * i] - AXIS.x;
    const dy = m.xy[2 * i + 1] - AXIS.y;
    if (dx * dx + dy * dy < reach * reach) return false;
  }
  return true;
}

/** The machine turned on `steps` steps while at rest (`atRest`): only the carousel moves. */
export function idle(m: Machine, steps: number): void {
  m.step += Math.max(0, Math.floor(steps));
  if (m.rest > 0) m.rest = Math.max(0, m.rest - steps);
}

/** Whether anything is still to happen that the player is owed or waits for: a medal on its way, a spin, a throw. */
export const busy = (m: Machine): boolean => m.air.length > 0 || m.spin !== null || m.holds > 0 || m.fling > 0;

// ── A machine as it stands in the arcade ────────────────────────────────────

/**
 * A machine as it stands on the floor before anyone has played it: its field full of medals, pushed into place by
 * the carousel turning, and still. The medals are laid close as they lie on a real one, a few taken out here and
 * there, and the carousel is turned until nothing more moves; any that go over an edge meanwhile are the machine's.
 */
export function freshMachine(seed: number): Machine {
  const m = emptyMachine(seed);
  const pitch = 2.02;
  const rowStep = pitch * 0.8660254037844386;
  let id = 1;
  for (let row = 0; ; row++) {
    const y = MEDAL_RADIUS + 0.05 + row * rowStep;
    if (y > FIELD.depth - MEDAL_RADIUS * 1.6) break;
    const shift = row % 2 === 0 ? 0 : pitch / 2;
    for (let x = MEDAL_RADIUS + 0.05 + shift; x <= FIELD.width - MEDAL_RADIUS - 0.05; x += pitch) {
      const dx = x - AXIS.x;
      const dy = y - AXIS.y;
      if (dx * dx + dy * dy < (REACH + MEDAL_RADIUS + 0.4) * (REACH + MEDAL_RADIUS + 0.4)) continue;
      if (!insideWalls(x, y, MEDAL_RADIUS + 0.05)) continue;
      if (nextRandom(m) < 0.12) continue;
      m.xy.push(x + (nextRandom(m) - 0.5) * 0.1, y + (nextRandom(m) - 0.5) * 0.1);
      m.grow.push(1);
      m.ids.push(id++);
    }
  }
  m.nextId = id;
  const quiet: Lottery = { spinFrom: () => ({ outcome: 0, digits: [0, 0, 0], from: 0, stops: [0, 0, 0], at: 0 }), prize: () => 0 };
  for (let s = 0; s < 6 * TURN_STEPS && !atRest(m); s++) step(m, quiet);
  m.tray = 0;
  m.step = 0;
  m.quiet = Math.max(m.quiet, 30);
  return m;
}
