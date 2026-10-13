/**
 * The playfield of a medal pusher, seen from above.
 *
 * Two tables. The upper one is the pusher: it slides back and forth under a
 * fixed back wall and carries the medals lying on it. When it pulls back, the
 * wall scrapes the rearmost medals forward along it, and whatever is pushed
 * over its front lip drops to the lower table. When it comes forward again its
 * front face shoves the lower table's medals toward the player. Medals that go
 * over the front edge are won; near the front the sides are open, and medals
 * squeezed out there are lost. Prize balls lie among the medals and are pushed
 * the same way, and big prizes stand on the pusher as towers of medals.
 *
 * The player's medals come in by two feed arms, the left and the right, each
 * with a slot of its own. A medal fed into an arm rolls down that arm's rail
 * on its edge and drops off the tip onto the back of the pusher. Each arm has
 * an aim of its own and swings its tip there, so a medal comes down where its
 * arm's tip has got to at the moment it leaves, not where the aim was when
 * the medal went in. Both arms can be fed at once.
 *
 * Medals lie flat, two deep at most. The lower tier lies on the table. A
 * medal that comes down where there is no room for it stays on top of the
 * others: it rides along with the medals under it, slides over them when it
 * is pushed, and drops into the lower tier as soon as a gap opens beneath it.
 * Nothing moves unless something pushes it, so the engine resolves overlaps
 * directly instead of integrating velocities. It takes its random numbers from a seeded generator and no
 * clock, so the table, the tests and the simulation tab all run the same
 * machine, and a given seed always plays out the same way.
 */

/** Distances are in field units: the field is 100 wide and 100 deep. */
export const FIELD = {
  width: 100,
  /** The front edge. Depth is measured from the back wall. */
  depth: 100,
  /** Beyond this depth the side walls stop, and a medal pushed sideways is lost. */
  sideOpenFrom: 78,
} as const;

export const MEDAL_RADIUS = 3.2;
export const MEDAL_THICKNESS = 0.9;

/** The pusher's front lip moves between these depths, once per `period` seconds. */
export const PUSHER = { min: 30, max: 46, period: 3.6 } as const;

/** A dropped medal lands in this band of depth, on the pusher, a little off its aim. */
export const LANDING = { from: 6, to: 13, scatter: 12 } as const;
/**
 * Where a medal the machine pays out, or a prize ball, is let go: this close
 * to the back wall, and this high above the lower table when the wall was a
 * low panel. Where on the cabinet that is drawn, and where the tips of the
 * feed arms hang, is in arms.ts.
 */
export const RELEASE = { height: 34, depth: 1.2 } as const;
/**
 * A medal lying on others drops into the lower tier when no medal of that tier
 * has its centre within this share of a diameter of it. Three medals touching
 * leave a hollow whose middle is 0.58 of a diameter from each, where a fourth
 * rests without falling through; anything roomier than this is a gap.
 */
export const GAP = 0.72;
/** A landing medal starts with this share of its room among the others and takes this long, in seconds, to have all of it. */
export const SETTLE = { from: 0.3, time: 0.32 } as const;
/** How long a medal is in the air, and how often one arm's slot takes a medal. Each arm waits on its own. */
export const FALL_TIME = 0.45;
export const DROP_INTERVAL = 0.18;
/**
 * How long a medal the player feeds is on its way before it drops off the tip
 * of its arm: long enough to watch it go in at the slot by the player's hand
 * and roll the length of the rail to the back of the cabinet, short enough
 * that the machine still answers a press. A slot feeds faster than that,
 * so a stream of medals has five on the way down each arm at once.
 */
export const ROLL_TIME = 0.9;
/**
 * The two legs of that way, in seconds: taken in at the slot at the near end
 * of its arm, and along the arm's rail to the tip. They add up to the time
 * above, which is all the machine goes by: it settles where a medal lands as
 * it leaves the tip, and the legs only say where the medal is drawn
 * meanwhile. The rail's leg is longer than the whole way was when the arms
 * were short, so a medal saved on a rail then is on its rail now.
 */
export const FEED = { slot: 0.1, arm: 0.8 } as const;

/**
 * The chuckers: three START pockets in a row on the pusher's lip, at these
 * places across the field. They ride out and back with the lip and do not move
 * along it. A medal that goes over the lip with its middle within `halfWidth`
 * of one drops through it, and starts the slot on the screen, on its way down
 * to the lower table. Any medal does: one the player fed, one the machine paid
 * out, or one off a tower that goes over there. A ball does not fit.
 *
 * They stand together in the middle of the lip because that is the only place
 * where aiming still tells. By the time a medal has been pushed the length of
 * the pusher the pile has spread it far to either side, so pockets spaced
 * evenly across the lip take much the same share whatever column is fed. With
 * the three in the middle, about one medal in eight ends up through one when
 * the middle is fed, about one in fourteen when medals are fed anywhere at
 * all, and about one in thirty-five when they are fed at the edges. The
 * pockets are as far apart as the towers are, so the towers, which go up to
 * either side of the middle, stand between them.
 *
 * `halfWidth` is what the machine's return is tuned with, together with what
 * a spin is worth (`SPIN_TABLE` in lottery.ts): scripts/medal-pusher-tune.ts
 * measures both. At this width the best a player can do, feeding the middle
 * slowly, gets about 97% back with average luck on the screen, and about 95%
 * at two medals a second. `wingWidth` is how wide a slot takes medals while
 * its wings are open, which is during chance time: as wide as the pockets
 * were before they were narrowed.
 */
export const CHECKERS = { positions: [36, 50, 64], halfWidth: 1.13, wingWidth: 1.7 } as const;

/**
 * The lucky lamp. One of the three slots is lit gold at a time, and the light
 * steps one slot along, from the left, with every stroke of the pusher: it
 * moves as the pusher comes to the back of its stroke, so each push has its
 * own gold slot. Which slot is lit is read off the machine's clock and
 * nothing else. What a medal through the lit slot is worth is the session's
 * to say.
 */
export const LUCKY = { dwell: PUSHER.period } as const;

/** The slot the lucky lamp is on at `time`. */
export function luckySlot(time: number): number {
  return Math.floor(time / LUCKY.dwell + 1e-9) % CHECKERS.positions.length;
}

/**
 * Payout medals are thrown onto the pusher across this band, a few per second;
 * a queue longer than `rushAbove` (a jackpot) pours twice as fast.
 */
export const PAYOUT = { from: 14, to: 86, perSecond: 9, rushAbove: 120 } as const;

/**
 * Medal towers: a big prize is not thrown onto the field but stacked on the
 * pusher, in towers that ride it like any medal until they are pushed over
 * its lip and come down across the lower table.
 */
export const TOWER = {
  /** The most medals in one tower. */
  max: 25,
  /** Medals a second that each tower gains while it is going up. */
  perSecond: 18,
  /** Towers stand in rows of up to `perRow`, `spacing` apart, each row this far behind the lip. */
  perRow: 6,
  spacing: 14,
  rows: [9, 17, 25],
  /** How many times harder than a single medal a tower is to push. */
  weight: 3,
  /** Seconds its medals take to come down when it goes over: the bottom one, and the top one. */
  fall: { first: 0.16, last: 0.62 },
} as const;

/**
 * Medals thrown onto the two tables when a machine is switched on, and onto
 * the top of each pile: about as many as lie there once it has been played
 * for a while, so the first medal dropped already pushes another one out. A
 * few that will not fit, or would have nothing to lie on, are left out.
 */
export const INITIAL = { upper: 74, lower: 132, onTop: { upper: 56, lower: 22 } } as const;
/** Where the balls a machine starts with lie: the first on the lower table, the second on the pusher. */
export const BALL_SPOTS: readonly { level: Level; x: number; y: number }[] = [
  { level: 0, x: 38, y: 70 },
  { level: 1, x: 64, y: 16 },
  { level: 0, x: 66, y: 60 },
];

const R = MEDAL_RADIUS;
const DIAMETER = R * 2;
/** Relaxation passes per step: enough for a pusher that moves a fraction of a unit per step. */
const ITERATIONS = 6;
/** Longer steps are cut into pieces no longer than this, so the pusher never moves far at once. */
const MAX_STEP = 1 / 60;

/** Where a medal lies: on the pusher (1) or on the lower table (0). */
export type Level = 0 | 1;
/** How deep in the pile it lies: on the table itself (0), or on top of other medals (1). */
export type Tier = 0 | 1;

export interface Medal {
  id: number;
  x: number;
  y: number;
  level: Level;
  tier: Tier;
  /** Seconds since it dropped from the pusher to the lower table (for drawing the fall); −1 before that. */
  sinceDrop: number;
  /** Medals stacked here: 1 for a medal lying on its own, more for a tower. */
  stack: number;
  /** Medals a tower that is still going up has yet to gain. */
  grow: number;
  /** Whether this is a prize ball. It lies among the medals and is pushed like one. */
  ball: boolean;
  /**
   * How far a medal that has just landed has worked its way into the pile.
   * It comes down on top of the others, so at first it takes up only a little
   * room among them, and all of it (1) a fraction of a second later. The
   * medals round it are eased aside over that time instead of being thrown
   * apart in one step. It is drawn full size throughout, lying on top.
   */
  grown: number;
}

/** A feed arm: the left one (0) or the right one (1). */
export type Arm = 0 | 1;

/**
 * A medal on its way down an arm's rail. Where it will land is not settled
 * yet: that depends on where its arm is pointing when it gets to the tip.
 */
export interface RollingMedal {
  id: number;
  arm: Arm;
  /** Seconds until it reaches the tip and drops off. */
  remaining: number;
}

export interface FallingMedal {
  id: number;
  /** Where it will land, and on which table. */
  x: number;
  y: number;
  level: Level;
  /** Where it was let go, for drawing its way down. */
  fromX: number;
  fromY: number;
  /** How many medals lay under it, when it comes off a tower. */
  rank: number;
  ball: boolean;
  /** Seconds until it lands, out of the seconds the whole fall takes. */
  remaining: number;
  duration: number;
  /** Whether the player dropped it, the machine paid it out, or it came off a falling tower. */
  source: 'player' | 'payout' | 'spill';
}

export interface Machine {
  time: number;
  medals: Medal[];
  /** Medals on the arms' rails, in the order they were fed. */
  rolling: RollingMedal[];
  falling: FallingMedal[];
  /** Payout medals still to be thrown onto the field. */
  payoutQueue: number;
  payoutClock: number;
  /** Medals the towers that are going up have yet to gain, all told. */
  growing: number;
  towerClock: number;
  /** Seconds until each arm's slot can take its next medal, the left arm's first. */
  waits: [number, number];
  /**
   * Where across the field each arm is pointed, the left arm's first: within
   * its own reach, and the left never to the right of the right. Whoever
   * plays the machine sets them, with `aimArm`.
   */
  aims: [number, number];
  /**
   * Where across the field each arm's tip is, the left arm's first. A tip
   * swings to its arm's aim as the machine runs, and a medal is let go
   * wherever its arm's tip is by then.
   */
  tips: [number, number];
  nextId: number;
  rng: () => number;
}

/** What happened during a step. */
export interface StepEvents {
  /** Medals that went over the front edge. */
  won: number;
  /** Medals that went out of the open sides. */
  lost: number;
  /** The chucker each medal that went over the lip through one dropped through, one entry per medal. */
  checkers: number[];
  /** Medals that touched down on a table. */
  landed: number;
  /** Towers that went over the pusher's lip. */
  toppled: number;
  /** Balls that went over the front edge. */
  balls: number;
}

/**
 * A reproducible generator (Park–Miller) from any finite seed: negative or
 * fractional seeds are folded into its valid state range 1 … 2³¹ − 2.
 */
export function seededRng(seed: number): () => number {
  if (!Number.isFinite(seed)) throw new Error('seed must be a finite number');
  let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** The depth of the pusher's front lip at a given time: a smooth stroke that starts fully back. */
export function pusherFront(time: number): number {
  const phase = (1 - Math.cos((2 * Math.PI * time) / PUSHER.period)) / 2;
  return PUSHER.min + (PUSHER.max - PUSHER.min) * phase;
}

/** The chucker a medal that goes over the lip at `x` drops through, or −1 when it goes over between two of them. */
export function checkerAt(x: number, halfWidth: number = CHECKERS.halfWidth): number {
  return CHECKERS.positions.findIndex((center) => Math.abs(x - center) <= halfWidth);
}

// ── Overlap resolution ──────────────────────────────────────────────────────

/**
 * Medals are sorted into a grid once per step. Its cells are a little wider
 * than a medal, so the few fractions of a unit a medal moves during the step's
 * relaxation passes cannot carry a touching pair out of neighbouring cells.
 */
const CELL = DIAMETER * 1.3;
const COLUMNS = Math.ceil(FIELD.width / CELL) + 4;
const ROWS = Math.ceil(FIELD.depth / CELL) + 6;
/** Lists per cell of the floor plan: two tables, two tiers each. */
const LISTS = 4;
const heads = new Int32Array(COLUMNS * ROWS * LISTS);
let links = new Int32Array(512);
let cells = new Int32Array(512);
/** Where each medal was before a step's pushing apart, to tell how far it has been moved. */
let startX = new Float64Array(512);
let startY = new Float64Array(512);
/** How many towers and balls stand on each table: they block the upper tier as well as the lower. */
const tall = [0, 0];

/** Whether something stands taller than a medal lying flat: a tower, even one still going up, or a ball. */
const isTall = (medal: Medal): boolean => medal.ball || medal.stack + medal.grow > 1;

function buildGrid(medals: Medal[]): void {
  const count = medals.length;
  if (links.length < count) {
    links = new Int32Array(count * 2);
    cells = new Int32Array(count * 2);
    startX = new Float64Array(count * 2);
    startY = new Float64Array(count * 2);
  }
  heads.fill(-1);
  tall[0] = tall[1] = 0;
  for (let i = 0; i < count; i++) {
    const medal = medals[i];
    const column = Math.min(COLUMNS - 2, Math.max(1, Math.floor(medal.x / CELL) + 2));
    const row = Math.min(ROWS - 2, Math.max(1, Math.floor(medal.y / CELL) + 2));
    const cell = (row * COLUMNS + column) * LISTS + medal.level * 2 + medal.tier;
    cells[i] = cell;
    links[i] = heads[cell];
    heads[cell] = i;
    startX[i] = medal.x;
    startY[i] = medal.y;
    if (isTall(medal)) tall[medal.level]++;
  }
}

/** The cells ahead of a medal's own: with them, every neighbouring pair of cells is visited once. */
const AHEAD = [1, COLUMNS - 1, COLUMNS, COLUMNS + 1].map((offset) => offset * LISTS);
/** A medal's own cell and the eight round it. */
const AROUND = [-COLUMNS - 1, -COLUMNS, -COLUMNS + 1, -1, 0, 1, COLUMNS - 1, COLUMNS, COLUMNS + 1].map((offset) => offset * LISTS);

/** Pushes two touching medals apart: half the overlap each, or less for a tower and more for what leans on it. */
function part(a: Medal, b: Medal): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const squared = dx * dx + dy * dy;
  const reach = R * (a.grown + b.grown);
  if (squared >= reach * reach) return;
  let distance = Math.sqrt(squared);
  if (distance < 1e-6) {
    // Exactly on top of each other: part them along a direction fixed by their ids.
    const angle = ((a.id * 7 + b.id * 13) % 360) * (Math.PI / 180);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }
  const weightA = a.stack > 1 ? TOWER.weight : 1;
  const weightB = b.stack > 1 ? TOWER.weight : 1;
  const push = (reach - distance) / distance / (weightA + weightB);
  a.x -= dx * push * weightB;
  a.y -= dy * push * weightB;
  b.x += dx * push * weightA;
  b.y += dy * push * weightA;
}

/**
 * Separates every pair of touching medals that lie on the same table and in
 * the same tier. A medal of the upper tier is also kept off whatever stands
 * taller than a medal, since a tower or a ball is in its way too.
 */
function separate(medals: Medal[]): void {
  const count = medals.length;
  for (let i = 0; i < count; i++) {
    const a = medals[i];
    const cell = cells[i];
    // The rest of its own cell, then the cells ahead.
    for (let j = links[i]; j !== -1; j = links[j]) part(a, medals[j]);
    for (let n = 0; n < 4; n++) {
      for (let j = heads[cell + AHEAD[n]]; j !== -1; j = links[j]) part(a, medals[j]);
    }
    if (a.tier === 1 && tall[a.level] > 0) {
      const below = cell - 1;
      for (let n = 0; n < 9; n++) {
        for (let j = heads[below + AROUND[n]]; j !== -1; j = links[j]) if (isTall(medals[j])) part(a, medals[j]);
      }
    }
  }
}

/**
 * What lies under each medal of the upper tier. It is carried along by the
 * medals it rests on, as far as they were moved in this step, and it drops
 * into the lower tier where a gap has opened beneath it.
 */
function settleUpperTier(medals: Medal[]): void {
  const count = medals.length;
  const gap = (GAP * DIAMETER) ** 2;
  for (let i = 0; i < count; i++) {
    const a = medals[i];
    if (a.tier !== 1) continue;
    const below = cells[i] - 1;
    let nearest = Infinity;
    let under = 0;
    let moveX = 0;
    let moveY = 0;
    for (let n = 0; n < 9; n++) {
      for (let j = heads[below + AROUND[n]]; j !== -1; j = links[j]) {
        const b = medals[j];
        // Where the two were before the pushing apart, so the order they are visited in does not matter.
        const squared = (startX[j] - startX[i]) ** 2 + (startY[j] - startY[i]) ** 2;
        if (squared < nearest) nearest = squared;
        if (squared < DIAMETER * DIAMETER) {
          under++;
          moveX += b.x - startX[j];
          moveY += b.y - startY[j];
        }
      }
    }
    if (under > 0) {
      a.x += moveX / under;
      a.y += moveY / under;
    }
    if (nearest >= gap) {
      a.tier = 0;
      a.grown = SETTLE.from;
    }
  }
}

/** Whether a medal coming down at (x, y) on a table finds room in the lower tier, or has to lie on top. */
function roomBelow(medals: Medal[], level: Level, x: number, y: number): boolean {
  const gap = (GAP * DIAMETER) ** 2;
  for (const medal of medals) {
    if (medal.level === level && medal.tier === 0 && (medal.x - x) ** 2 + (medal.y - y) ** 2 < gap) return false;
  }
  return true;
}

/**
 * Passes of pushing apart that turn a random scatter into a pile with no medal
 * on another. A pile this dense settles slowly; with fewer passes it is still
 * squeezed when the machine starts, and springs medals over the edge unasked.
 */
const SETTLE_PASSES = 800;
/** How far into each other two medals may still be after that, as a share of a diameter. */
const SETTLED = 0.004;

/**
 * Fills a band of one table, in one tier. The medals are thrown down at
 * random, overlapping, and then pushed apart inside the band until they lie
 * side by side — a packed but irregular pile, the way a played machine looks.
 */
function fillTable(machine: Machine, count: number, level: Level, tier: Tier, yFrom: number, yTo: number): void {
  const medals: Medal[] = [];
  for (let i = 0; i < count; i++) {
    const x = R + machine.rng() * (FIELD.width - DIAMETER);
    const y = yFrom + machine.rng() * (yTo - yFrom);
    medals.push({ id: machine.nextId++, x, y, level, tier, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1 });
  }
  for (let pass = 0; pass < SETTLE_PASSES; pass++) {
    buildGrid(medals);
    separate(medals);
    for (const medal of medals) {
      medal.x = Math.min(FIELD.width - R, Math.max(R, medal.x));
      medal.y = Math.min(yTo, Math.max(yFrom, medal.y));
    }
  }
  // Now and then a corner of the pile is still squeezed. A medal left pressing on
  // another would spring the pile apart once the machine starts, so it is taken out.
  // On top of a pile a medal also needs something to lie on, well inside the reach of a medal
  // beneath it, and it keeps clear of any ball: otherwise it would move the moment the machine starts.
  const under = tier === 1 ? machine.medals.filter((medal) => medal.level === level && medal.tier === 0) : [];
  const supported = (medal: Medal): boolean => {
    if (tier === 0) return true;
    let nearest = Infinity;
    for (const other of under) {
      const distance = Math.hypot(other.x - medal.x, other.y - medal.y);
      if (other.ball && distance < DIAMETER * 1.6) return false;
      if (!other.ball && distance < nearest) nearest = distance;
    }
    return nearest < DIAMETER * GAP * 0.85;
  };
  const kept: Medal[] = [];
  for (const medal of medals) {
    if (supported(medal) && kept.every((other) => Math.hypot(other.x - medal.x, other.y - medal.y) >= DIAMETER * (1 - SETTLED))) kept.push(medal);
  }
  machine.medals.push(...kept);
}

/**
 * A machine with both tables already carrying medals, as an arcade leaves it,
 * and `balls` prize balls lying among them (at most BALL_SPOTS.length).
 */
export function createMachine(seed: number, balls = 0): Machine {
  if (!Number.isInteger(balls) || balls < 0 || balls > BALL_SPOTS.length) throw new Error('a machine starts with 0 to 3 balls');
  const machine: Machine = {
    time: 0,
    medals: [],
    rolling: [],
    falling: [],
    payoutQueue: 0,
    payoutClock: 0,
    growing: 0,
    towerClock: 0,
    waits: [0, 0],
    // Each arm points a little to its own side of the middle, and its tip is there already.
    aims: [armStart(0), armStart(1)],
    tips: [armStart(0), armStart(1)],
    nextId: 1,
    rng: seededRng(seed),
  };
  // The pusher starts fully back: its own medals fit behind the lip, and the
  // lower table's lie beyond its full reach, so nothing moves until it is fed.
  fillTable(machine, INITIAL.upper, 1, 0, R, PUSHER.min - 0.5);
  fillTable(machine, INITIAL.lower, 0, 0, PUSHER.max + R, FIELD.depth - 0.5);
  // A ball takes the place of the medal lying nearest its spot.
  for (const spot of BALL_SPOTS.slice(0, balls)) {
    let nearest: Medal | null = null;
    let best = Infinity;
    for (const medal of machine.medals) {
      const distance = Math.hypot(medal.x - spot.x, medal.y - spot.y);
      if (medal.level === spot.level && !medal.ball && distance < best) {
        best = distance;
        nearest = medal;
      }
    }
    if (nearest) nearest.ball = true;
  }
  // Then the medals lying on top of each pile, once the balls are where they will be.
  fillTable(machine, INITIAL.onTop.upper, 1, 1, R, PUSHER.min - 0.5);
  fillTable(machine, INITIAL.onTop.lower, 0, 1, PUSHER.max + R, FIELD.depth - 0.5);
  return machine;
}

/** The furthest left and right a medal can be aimed. */
export const AIM = { min: R + 1, max: FIELD.width - R - 1 } as const;
export const clampAim = (x: number): number => Math.min(AIM.max, Math.max(AIM.min, x));

/**
 * How far across the field each arm's tip can be, the left arm's first. Each
 * reaches a little past the middle, so that either can feed the column behind
 * the centre chucker.
 */
export const ARM_REACH: readonly [{ min: number; max: number }, { min: number; max: number }] = [
  { min: AIM.min, max: FIELD.width / 2 + 10 },
  { min: FIELD.width / 2 - 10, max: AIM.max },
];
/** The arm on the side of the field that `x` is on: the left arm for the left half. */
export const armFor = (x: number): Arm => (x < FIELD.width / 2 ? 0 : 1);
/** Where an arm's tip is once it has swung to an aim of `aim`: over the aim, as far as that arm reaches. */
export const tipOf = (arm: Arm, aim: number): number => Math.min(ARM_REACH[arm].max, Math.max(ARM_REACH[arm].min, aim));

/**
 * A new machine's arms each point this far to their own side of the middle:
 * over the lip between the centre chucker and the outer one on that side, which
 * is as good a place to feed as the middle itself.
 */
export const ARM_START = 7;
/**
 * How fast a tip swings to where it belongs, in field units a second: fast
 * enough to cross its arm's whole reach in less time than the slot waits
 * between two medals. So whoever knows where each medal is meant to drop can
 * have its arm there by the time it leaves, however fast the medals are fed.
 * An aim that jumps as a medal gets to the tip is another matter: that medal
 * leaves from wherever the tip has got to.
 */
export const ARM_SPEED = 320;

/** Where across the field an arm points when the machine is new. */
export const armStart = (arm: Arm): number => FIELD.width / 2 + (arm === 0 ? -ARM_START : ARM_START);

/** Where across the field an arm's tip belongs: over its own aim, always. An arm has no other place to be. */
export function armGoal(machine: Machine, arm: Arm): number {
  return machine.aims[arm];
}

/** A tip on its way to where it belongs, `dt` seconds on: it swings there at the arms' speed and stops. */
export function swing(tipX: number, goal: number, dt: number): number {
  const reach = ARM_SPEED * dt;
  return Math.abs(goal - tipX) <= reach ? goal : tipX + Math.sign(goal - tipX) * reach;
}

/**
 * Points one arm at `aimX`, as near to it as the arm can point: within its
 * own reach, and no further than the other arm's aim, since the two rails do
 * not cross. Its tip swings there as the machine runs, and a medal on its
 * rail drops wherever the tip has got to when it reaches it. The other arm is
 * left as it is.
 */
export function aimArm(machine: Machine, arm: Arm, aimX: number): void {
  if (!Number.isFinite(aimX)) throw new Error('the aim must be a number');
  const own = tipOf(arm, aimX);
  machine.aims[arm] = arm === 0 ? Math.min(own, machine.aims[1]) : Math.max(own, machine.aims[0]);
}

/**
 * Feeds one medal into an arm. It rolls down that arm's rail and lands a
 * little to one side of wherever the arm's tip is by then. Neither arm's aim
 * is touched. Returns whether the arm took it: each slot feeds one medal
 * every DROP_INTERVAL, and the two slots wait on their own, so both arms can
 * be fed in the same instant.
 */
export function dropMedal(machine: Machine, arm: Arm): boolean {
  if (arm !== 0 && arm !== 1) throw new Error('there is a left arm (0) and a right arm (1)');
  if (machine.waits[arm] > 1e-9) return false;
  machine.rolling.push({ id: machine.nextId++, arm, remaining: ROLL_TIME });
  machine.waits[arm] = DROP_INTERVAL;
  return true;
}

/** Queues `count` medals for the machine to throw onto the field. */
export function queuePayout(machine: Machine, count: number): void {
  if (!Number.isInteger(count) || count < 0) throw new Error('a payout is a whole number of medals');
  machine.payoutQueue += count;
}

/** Lets a prize ball go down the back panel. It lands on the pusher like a paid-out medal. */
export function dropBall(machine: Machine): void {
  const x = PAYOUT.from + machine.rng() * (PAYOUT.to - PAYOUT.from);
  const y = LANDING.from + machine.rng() * (LANDING.to - LANDING.from);
  machine.falling.push({ id: machine.nextId++, x, y, level: 1, fromX: x, fromY: RELEASE.depth, rank: 0, ball: true, remaining: FALL_TIME, duration: FALL_TIME, source: 'payout' });
}

/** Every place on the pusher a tower can stand. */
export const TOWER_SITES = TOWER.perRow * TOWER.rows.length;

/**
 * How a prize of `medals` is split into towers when `sites` places are free:
 * as few towers as will hold it, as even as they can be. What they cannot
 * hold is left out of the list.
 */
export function towerSizes(medals: number, sites: number = TOWER_SITES): number[] {
  if (!Number.isInteger(medals) || medals < 0) throw new Error('a payout is a whole number of medals');
  if (!Number.isInteger(sites) || sites < 0) throw new Error('sites is a whole number of places');
  const count = Math.min(sites, Math.ceil(medals / TOWER.max));
  const stacked = Math.min(medals, count * TOWER.max);
  return Array.from({ length: count }, (_, index) => Math.floor(stacked / count) + (index < stacked % count ? 1 : 0));
}

/**
 * Pays `medals` as towers on the pusher. Each starts as one medal and gains the
 * rest as the machine runs. A tower only ever goes up where no tower stands:
 * what the free places cannot hold is thrown on loose.
 */
export function buildTowers(machine: Machine, medals: number): void {
  if (!Number.isInteger(medals) || medals < 0) throw new Error('a payout is a whole number of medals');
  const front = pusherFront(machine.time);
  // Every place a tower can stand, the middle of the front row first.
  const sites: { x: number; y: number; taken: boolean }[] = [];
  for (const offset of TOWER.rows) {
    for (let i = 0; i < TOWER.perRow; i++) {
      const fromMiddle = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1) + (TOWER.perRow % 2 === 0 ? 0.5 : 0);
      const x = FIELD.width / 2 + fromMiddle * TOWER.spacing;
      const y = Math.max(R, front - offset);
      // A place is taken when a tower stands close enough to touch one put there. The places
      // themselves are further apart than that, so a tower never blocks the place behind it.
      const taken = machine.medals.some((m) => m.level === 1 && m.stack + m.grow > 1 && Math.hypot(m.x - x, m.y - y) < DIAMETER * 1.1);
      sites.push({ x, y, taken });
    }
  }
  const free = sites.filter((site) => !site.taken);
  const sizes = towerSizes(medals, free.length);
  let stacked = 0;
  sizes.forEach((size, index) => {
    const { x, y } = free[index];
    machine.medals.push({ id: machine.nextId++, x, y, level: 1, tier: 0, sinceDrop: -1, stack: 1, grow: size - 1, ball: false, grown: 1 });
    machine.growing += size - 1;
    stacked += size;
  });
  machine.payoutQueue += medals - stacked;
}

/** Every medal the field holds: lying, stacked, still to be stacked, on an arm, in the air, or waiting to be thrown on. Balls are not medals. */
export function medalsOnField(machine: Machine): number {
  let count = machine.payoutQueue + machine.rolling.length;
  for (const medal of machine.falling) if (!medal.ball) count += 1;
  for (const medal of machine.medals) if (!medal.ball) count += medal.stack + medal.grow;
  return count;
}

/** The balls lying on the field or on their way down to it. */
export function ballsOnField(machine: Machine): number {
  let count = 0;
  for (const medal of machine.falling) if (medal.ball) count += 1;
  for (const medal of machine.medals) if (medal.ball) count += 1;
  return count;
}

/**
 * A tower goes over the lip: its medals come down across the lower table, the
 * bottom ones first and nearest, the top ones last and furthest, fanning out.
 */
function spill(machine: Machine, tower: Medal, lip: number): void {
  const room = Math.max(DIAMETER, FIELD.depth - R - lip - R);
  const length = Math.min(room, tower.stack * MEDAL_THICKNESS * 1.1);
  for (let rank = 0; rank < tower.stack; rank++) {
    const along = (rank + 0.5) / tower.stack;
    const reach = R + along * length;
    const sideways = (machine.rng() + machine.rng() - 1) * (R + reach * 0.35);
    const duration = TOWER.fall.first + along * (TOWER.fall.last - TOWER.fall.first);
    machine.falling.push({
      id: machine.nextId++,
      x: Math.min(FIELD.width - R, Math.max(R, tower.x + sideways)),
      y: Math.min(FIELD.depth - R, lip + reach + (machine.rng() - 0.5) * 2),
      level: 0,
      fromX: tower.x,
      fromY: lip,
      rank,
      ball: false,
      remaining: duration,
      duration,
      source: 'spill',
    });
  }
  // What it had not yet gained is thrown on loose instead.
  machine.payoutQueue += tower.grow;
  machine.growing -= tower.grow;
}

/** Keeps every medal clear of the walls and the pusher's front face. */
function constrain(medals: Medal[], front: number): void {
  for (const medal of medals) {
    if (medal.level === 1) {
      if (medal.y < R) medal.y = R;
      if (medal.x < R) medal.x = R;
      else if (medal.x > FIELD.width - R) medal.x = FIELD.width - R;
    } else {
      if (medal.y < front + R) medal.y = front + R;
      // The open sides are a slot the height of a medal: a ball does not fit through.
      if (medal.ball || medal.y < FIELD.sideOpenFrom) {
        if (medal.x < R) medal.x = R;
        else if (medal.x > FIELD.width - R) medal.x = FIELD.width - R;
      }
    }
  }
}

function advance(machine: Machine, dt: number, events: StepEvents, halfWidth: number): void {
  const before = pusherFront(machine.time);
  machine.time += dt;
  const front = pusherFront(machine.time);
  const carried = front - before;
  machine.waits[0] = Math.max(0, machine.waits[0] - dt);
  machine.waits[1] = Math.max(0, machine.waits[1] - dt);

  // The machine throws its payout medals onto the pusher, a few per second.
  if (machine.payoutQueue > 0) {
    machine.payoutClock += dt * PAYOUT.perSecond * (machine.payoutQueue > PAYOUT.rushAbove ? 2 : 1);
    while (machine.payoutClock >= 1 && machine.payoutQueue > 0) {
      machine.payoutClock -= 1;
      machine.payoutQueue -= 1;
      const x = PAYOUT.from + machine.rng() * (PAYOUT.to - PAYOUT.from);
      const y = LANDING.from + machine.rng() * (LANDING.to - LANDING.from);
      machine.falling.push({ id: machine.nextId++, x, y, level: 1, fromX: x, fromY: RELEASE.depth, rank: 0, ball: false, remaining: FALL_TIME, duration: FALL_TIME, source: 'payout' });
    }
  } else {
    machine.payoutClock = 0;
  }

  // Towers that are going up each gain a medal at a time.
  if (machine.growing > 0) {
    machine.towerClock += dt * TOWER.perSecond;
    while (machine.towerClock >= 1 && machine.growing > 0) {
      machine.towerClock -= 1;
      for (const medal of machine.medals) {
        if (medal.grow > 0) {
          medal.grow -= 1;
          medal.stack += 1;
          machine.growing -= 1;
        }
      }
    }
  } else {
    machine.towerClock = 0;
  }

  // Medals in the air come down: off an arm or down the back panel onto the pusher, off a tower onto the lower table.
  if (machine.falling.length > 0) {
    const stillFalling: FallingMedal[] = [];
    for (const medal of machine.falling) {
      medal.remaining -= dt;
      if (medal.remaining > 0) {
        stillFalling.push(medal);
        continue;
      }
      // It lies on the table where there is room for it, and on top of the others where there is not. A ball always makes room.
      const tier: Tier = medal.ball || roomBelow(machine.medals, medal.level, medal.x, medal.y) ? 0 : 1;
      machine.medals.push({ id: medal.id, x: medal.x, y: medal.y, level: medal.level, tier, sinceDrop: -1, stack: 1, grow: 0, ball: medal.ball, grown: SETTLE.from });
      events.landed++;
    }
    machine.falling = stillFalling;
  }

  // Each arm swings towards its own aim.
  machine.tips[0] = swing(machine.tips[0], armGoal(machine, 0), dt);
  machine.tips[1] = swing(machine.tips[1], armGoal(machine, 1), dt);

  // Medals on the arms roll on. One that gets to the tip drops off where its arm's tip is now, and
  // only now is it settled where it will land: a little to one side of that. From here it is a medal
  // in the air like any other. `remaining` has run that far past zero, and its fall is that much
  // shorter, so it lands a fall's length after the moment it left, however long the step. A roll
  // that ends within a billionth of a second of the step's end, either way, ends with the step.
  if (machine.rolling.length > 0) {
    const stillRolling: RollingMedal[] = [];
    for (const medal of machine.rolling) {
      medal.remaining -= dt;
      if (medal.remaining > 1e-9) {
        stillRolling.push(medal);
        continue;
      }
      const from = machine.tips[medal.arm];
      // Two draws make the scatter bunch around the tip instead of spreading evenly.
      const offset = (machine.rng() + machine.rng() - 1) * LANDING.scatter;
      const x = Math.min(FIELD.width - R, Math.max(R, from + offset));
      const y = LANDING.from + machine.rng() * (LANDING.to - LANDING.from);
      const remaining = medal.remaining < -1e-9 ? FALL_TIME + medal.remaining : FALL_TIME;
      machine.falling.push({ id: medal.id, x, y, level: 1, fromX: from, fromY: RELEASE.depth, rank: 0, ball: false, remaining, duration: FALL_TIME, source: 'player' });
    }
    machine.rolling = stillRolling;
  }

  // The pusher carries what lies on it; the walls and its front face hold their ground.
  const settle = (dt * (1 - SETTLE.from)) / SETTLE.time;
  for (const medal of machine.medals) {
    if (medal.level === 1) medal.y += carried;
    else if (medal.sinceDrop >= 0) medal.sinceDrop += dt;
    if (medal.grown < 1) medal.grown = Math.min(1, medal.grown + settle);
  }
  constrain(machine.medals, front);
  buildGrid(machine.medals);
  for (let i = 0; i < ITERATIONS; i++) {
    separate(machine.medals);
    constrain(machine.medals, front);
  }
  settleUpperTier(machine.medals);
  constrain(machine.medals, front);

  // Over the lip, over the front edge, or out of an open side. A medal that goes over the lip where
  // a chucker is drops through it. A tower that goes over there sends every one of its medals
  // through, one after another; a ball is too big for one.
  const kept: Medal[] = [];
  const crossing: Medal[] = [];
  for (const medal of machine.medals) {
    if (medal.level === 1) {
      if (medal.y > front) {
        const checker = medal.ball ? -1 : checkerAt(medal.x, halfWidth);
        for (let n = 0; checker >= 0 && n < medal.stack; n++) events.checkers.push(checker);
        if (medal.stack > 1) {
          spill(machine, medal, front);
          events.toppled++;
        } else {
          crossing.push(medal);
        }
        continue;
      }
      kept.push(medal);
    } else if (medal.y > FIELD.depth) {
      if (medal.ball) events.balls++;
      else events.won++;
    } else if (medal.x < 0 || medal.x > FIELD.width) {
      events.lost++;
    } else {
      kept.push(medal);
    }
  }
  // Whatever has gone over the lip comes down on the lower table: onto the table where there is
  // room, onto the pile where there is not. The medals that were underneath land first, so one
  // that was riding on another comes down on top of it again, whatever order the list holds them in.
  crossing.sort((a, b) => a.tier - b.tier || a.id - b.id);
  for (const medal of crossing) {
    medal.tier = medal.ball || roomBelow(kept, 0, medal.x, medal.y) ? 0 : 1;
    medal.level = 0;
    medal.sinceDrop = 0;
    medal.grown = SETTLE.from;
    kept.push(medal);
  }
  machine.medals = kept;
}

/** Moves the machine forward by `dt` seconds and reports what happened. */
export function step(machine: Machine, dt: number, wings = false): StepEvents {
  if (!(dt >= 0) || !Number.isFinite(dt)) throw new Error('the time step must be a non-negative number');
  const events: StepEvents = { won: 0, lost: 0, checkers: [], landed: 0, toppled: 0, balls: 0 };
  let remaining = dt;
  while (remaining > 1e-9) {
    const piece = Math.min(MAX_STEP, remaining);
    advance(machine, piece, events, wings ? CHECKERS.wingWidth : CHECKERS.halfWidth);
    remaining -= piece;
  }
  return events;
}

/**
 * The deepest overlap between two medals on the same table and in the same
 * tier, as a fraction of a diameter (0 = none). On the pusher a medal that has just landed lies on top
 * of others for a moment; the lower table is the one that should stay clean.
 */
export function worstOverlap(machine: Machine, level?: Level): number {
  let worst = 0;
  const medals = level === undefined ? machine.medals : machine.medals.filter((medal) => medal.level === level);
  for (let i = 0; i < medals.length; i++) {
    for (let j = i + 1; j < medals.length; j++) {
      if (medals[i].level !== medals[j].level || medals[i].tier !== medals[j].tier) continue;
      const distance = Math.hypot(medals[i].x - medals[j].x, medals[i].y - medals[j].y);
      if (distance < DIAMETER) worst = Math.max(worst, (DIAMETER - distance) / DIAMETER);
    }
  }
  return worst;
}
