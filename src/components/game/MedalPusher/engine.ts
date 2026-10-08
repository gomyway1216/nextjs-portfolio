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
 * Medals lie flat in one layer per table and move only when something pushes
 * them, so the engine resolves overlaps directly instead of integrating
 * velocities. It takes its random numbers from a seeded generator and no
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
/** Where it is let go: this high above the lower table, this close to the back panel. */
export const RELEASE = { height: 34, depth: 1.2 } as const;
/** How long a medal is in the air, and how often one can be dropped. */
export const FALL_TIME = 0.45;
export const DROP_INTERVAL = 0.18;

/** The chuckers: a medal that lands within `halfWidth` of one starts the slot on the screen. */
export const CHECKERS = { positions: [25, 50, 75], halfWidth: 1.4 } as const;

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
 * Medals thrown onto the two tables when a machine is switched on: about as
 * many as lie there once it has been played for a while, so the first medal
 * dropped already pushes another one out. A few that will not fit are left out.
 */
export const INITIAL = { upper: 74, lower: 132 } as const;
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

export interface Medal {
  id: number;
  x: number;
  y: number;
  level: Level;
  /** Seconds since it dropped from the pusher to the lower table (for drawing the fall); −1 before that. */
  sinceDrop: number;
  /** Medals stacked here: 1 for a medal lying on its own, more for a tower. */
  stack: number;
  /** Medals a tower that is still going up has yet to gain. */
  grow: number;
  /** Whether this is a prize ball. It lies among the medals and is pushed like one. */
  ball: boolean;
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
  falling: FallingMedal[];
  /** Payout medals still to be thrown onto the field. */
  payoutQueue: number;
  payoutClock: number;
  /** Medals the towers that are going up have yet to gain, all told. */
  growing: number;
  towerClock: number;
  /** Seconds until the next medal can be dropped. */
  cooldown: number;
  nextId: number;
  rng: () => number;
}

/** What happened during a step. */
export interface StepEvents {
  /** Medals that went over the front edge. */
  won: number;
  /** Medals that went out of the open sides. */
  lost: number;
  /** The chucker each of the player's medals came down through, one entry per medal. */
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

/** The chucker a medal landing at `x` falls into, or −1. */
export function checkerAt(x: number): number {
  return CHECKERS.positions.findIndex((center) => Math.abs(x - center) <= CHECKERS.halfWidth);
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
const heads = new Int32Array(COLUMNS * ROWS * 2);
let links = new Int32Array(512);
let cells = new Int32Array(512);

function buildGrid(medals: Medal[]): void {
  const count = medals.length;
  if (links.length < count) {
    links = new Int32Array(count * 2);
    cells = new Int32Array(count * 2);
  }
  heads.fill(-1);
  for (let i = 0; i < count; i++) {
    const medal = medals[i];
    const column = Math.min(COLUMNS - 2, Math.max(1, Math.floor(medal.x / CELL) + 2));
    const row = Math.min(ROWS - 2, Math.max(1, Math.floor(medal.y / CELL) + 2));
    const cell = (row * COLUMNS + column) * 2 + medal.level;
    cells[i] = cell;
    links[i] = heads[cell];
    heads[cell] = i;
  }
}

/** The cells ahead of a medal's own: with them, every neighbouring pair of cells is visited once. */
const AHEAD = [1, COLUMNS - 1, COLUMNS, COLUMNS + 1].map((offset) => offset * 2);

/** Pushes two touching medals apart: half the overlap each, or less for a tower and more for what leans on it. */
function part(a: Medal, b: Medal): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const squared = dx * dx + dy * dy;
  if (squared >= DIAMETER * DIAMETER) return;
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
  const push = (DIAMETER - distance) / distance / (weightA + weightB);
  a.x -= dx * push * weightB;
  a.y -= dy * push * weightB;
  b.x += dx * push * weightA;
  b.y += dy * push * weightA;
}

/** Separates every pair of touching medals on the same table. */
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
  }
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
 * Fills a band of one table. The medals are thrown down at random, overlapping,
 * and then pushed apart inside the band until they lie side by side — a packed
 * but irregular pile, the way a played machine looks.
 */
function fillTable(machine: Machine, count: number, level: Level, yFrom: number, yTo: number): void {
  const medals: Medal[] = [];
  for (let i = 0; i < count; i++) {
    const x = R + machine.rng() * (FIELD.width - DIAMETER);
    const y = yFrom + machine.rng() * (yTo - yFrom);
    medals.push({ id: machine.nextId++, x, y, level, sinceDrop: -1, stack: 1, grow: 0, ball: false });
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
  const kept: Medal[] = [];
  for (const medal of medals) {
    if (kept.every((other) => Math.hypot(other.x - medal.x, other.y - medal.y) >= DIAMETER * (1 - SETTLED))) kept.push(medal);
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
    falling: [],
    payoutQueue: 0,
    payoutClock: 0,
    growing: 0,
    towerClock: 0,
    cooldown: 0,
    nextId: 1,
    rng: seededRng(seed),
  };
  // The pusher starts fully back: its own medals fit behind the lip, and the
  // lower table's lie beyond its full reach, so nothing moves until it is fed.
  fillTable(machine, INITIAL.upper, 1, R, PUSHER.min - 0.5);
  fillTable(machine, INITIAL.lower, 0, PUSHER.max + R, FIELD.depth - 0.5);
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
  return machine;
}

/** The furthest left and right a medal can be aimed. */
export const AIM = { min: R + 1, max: FIELD.width - R - 1 } as const;
export const clampAim = (x: number): number => Math.min(AIM.max, Math.max(AIM.min, x));

/**
 * Drops one medal, aimed at `aimX`. It lands a little to one side of the aim.
 * Returns whether the machine took it: the slot only feeds one every DROP_INTERVAL.
 */
export function dropMedal(machine: Machine, aimX: number): boolean {
  if (!Number.isFinite(aimX)) throw new Error('the aim must be a number');
  if (machine.cooldown > 1e-9) return false;
  // Two draws make the scatter bunch around the aim instead of spreading evenly.
  const from = clampAim(aimX);
  const offset = (machine.rng() + machine.rng() - 1) * LANDING.scatter;
  const x = Math.min(FIELD.width - R, Math.max(R, from + offset));
  const y = LANDING.from + machine.rng() * (LANDING.to - LANDING.from);
  machine.falling.push({ id: machine.nextId++, x, y, level: 1, fromX: from, fromY: RELEASE.depth, rank: 0, ball: false, remaining: FALL_TIME, duration: FALL_TIME, source: 'player' });
  machine.cooldown = DROP_INTERVAL;
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

/** How a prize of `medals` is split into towers: as few as will hold it, as even as they can be. */
export function towerSizes(medals: number): number[] {
  if (!Number.isInteger(medals) || medals < 0) throw new Error('a payout is a whole number of medals');
  const sites = TOWER.perRow * TOWER.rows.length;
  const count = Math.min(sites, Math.ceil(medals / TOWER.max));
  const stacked = Math.min(medals, count * TOWER.max);
  return Array.from({ length: count }, (_, index) => Math.floor(stacked / count) + (index < stacked % count ? 1 : 0));
}

/**
 * Pays `medals` as towers on the pusher. Each starts as one medal and gains the
 * rest as the machine runs. What the towers cannot hold is thrown on loose.
 */
export function buildTowers(machine: Machine, medals: number): void {
  const sizes = towerSizes(medals);
  const front = pusherFront(machine.time);
  let stacked = 0;
  sizes.forEach((size, index) => {
    const row = Math.floor(index / TOWER.perRow);
    const inRow = Math.min(TOWER.perRow, sizes.length - row * TOWER.perRow);
    const x = FIELD.width / 2 + ((index % TOWER.perRow) - (inRow - 1) / 2) * TOWER.spacing;
    const y = Math.max(R, front - TOWER.rows[row]);
    machine.medals.push({ id: machine.nextId++, x, y, level: 1, sinceDrop: -1, stack: 1, grow: size - 1, ball: false });
    machine.growing += size - 1;
    stacked += size;
  });
  machine.payoutQueue += medals - stacked;
}

/** Every medal the field holds: lying, stacked, still to be stacked, in the air, or waiting to be thrown on. Balls are not medals. */
export function medalsOnField(machine: Machine): number {
  let count = machine.payoutQueue;
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

function advance(machine: Machine, dt: number, events: StepEvents): void {
  const before = pusherFront(machine.time);
  machine.time += dt;
  const front = pusherFront(machine.time);
  const carried = front - before;
  machine.cooldown = Math.max(0, machine.cooldown - dt);

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

  // Medals in the air come down: from the chute onto the pusher, off a tower onto the lower table.
  if (machine.falling.length > 0) {
    const stillFalling: FallingMedal[] = [];
    for (const medal of machine.falling) {
      medal.remaining -= dt;
      if (medal.remaining > 0) {
        stillFalling.push(medal);
        continue;
      }
      machine.medals.push({ id: medal.id, x: medal.x, y: medal.y, level: medal.level, sinceDrop: -1, stack: 1, grow: 0, ball: medal.ball });
      events.landed++;
      if (medal.source === 'player') {
        const checker = checkerAt(medal.x);
        if (checker >= 0) events.checkers.push(checker);
      }
    }
    machine.falling = stillFalling;
  }

  // The pusher carries what lies on it; the walls and its front face hold their ground.
  for (const medal of machine.medals) {
    if (medal.level === 1) medal.y += carried;
    else if (medal.sinceDrop >= 0) medal.sinceDrop += dt;
  }
  constrain(machine.medals, front);
  buildGrid(machine.medals);
  for (let i = 0; i < ITERATIONS; i++) {
    separate(machine.medals);
    constrain(machine.medals, front);
  }
  constrain(machine.medals, front);

  // Over the lip, over the front edge, or out of an open side.
  const kept: Medal[] = [];
  for (const medal of machine.medals) {
    if (medal.level === 1) {
      if (medal.y > front) {
        if (medal.stack > 1) {
          spill(machine, medal, front);
          events.toppled++;
          continue;
        }
        medal.level = 0;
        medal.sinceDrop = 0;
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
  machine.medals = kept;
}

/** Moves the machine forward by `dt` seconds and reports what happened. */
export function step(machine: Machine, dt: number): StepEvents {
  if (!(dt >= 0) || !Number.isFinite(dt)) throw new Error('the time step must be a non-negative number');
  const events: StepEvents = { won: 0, lost: 0, checkers: [], landed: 0, toppled: 0, balls: 0 };
  let remaining = dt;
  while (remaining > 1e-9) {
    const piece = Math.min(MAX_STEP, remaining);
    advance(machine, piece, events);
    remaining -= piece;
  }
  return events;
}

/**
 * The deepest overlap between two medals on the same table, as a fraction of a
 * diameter (0 = none). On the pusher a medal that has just landed lies on top
 * of others for a moment; the lower table is the one that should stay clean.
 */
export function worstOverlap(machine: Machine, level?: Level): number {
  let worst = 0;
  const medals = level === undefined ? machine.medals : machine.medals.filter((medal) => medal.level === level);
  for (let i = 0; i < medals.length; i++) {
    for (let j = i + 1; j < medals.length; j++) {
      if (medals[i].level !== medals[j].level) continue;
      const distance = Math.hypot(medals[i].x - medals[j].x, medals[i].y - medals[j].y);
      if (distance < DIAMETER) worst = Math.max(worst, (DIAMETER - distance) / DIAMETER);
    }
  }
  return worst;
}
