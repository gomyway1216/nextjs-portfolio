/**
 * The playfield of a medal pusher, seen from above.
 *
 * Two tables. The upper one is the pusher: it slides back and forth under a
 * fixed back wall and carries the medals lying on it. When it pulls back, the
 * wall scrapes the rearmost medals forward along it, and whatever is pushed
 * over its front lip drops to the lower table. When it comes forward again its
 * front face shoves the lower table's medals toward the player. Medals that go
 * over the middle of the front edge are won; near the front the sides are
 * open, and the holes that take what is squeezed out there turn the front
 * corners, so a medal that goes over either end of the front edge is lost as
 * well. Prize balls lie among the medals and are pushed
 * the same way, and big prizes are stacked into towers of medals and pushed out onto it.
 *
 * What the machine pays comes from somewhere. A small win drops out of the
 * slot under the hood, a medal at a time; a big one is poured out of the
 * hopper's doors in the hood's face (hopper.ts); a tower is stacked in a glass
 * tube in a window at one of the screen's lower corners, and an arm pushes it
 * out of the tube onto the pusher (stacker.ts).
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
import { runHopper, shutHopper, type Hopper } from './hopper';
import { STACK, holdTowers, idleStacker, medalsInTubes, runStacker, stackTowers, type Stacker } from './stacker';

export { towerSizes } from './stacker';

export const FIELD = {
  width: 100,
  /** The front edge. Depth is measured from the back wall. */
  depth: 100,
  /** Beyond this depth the side walls stop, and a medal pushed sideways is lost. */
  sideOpenFrom: 78,
  /**
   * How far each side hole reaches round its front corner, along the front
   * edge. The hole that runs down an open side turns the corner and runs this
   * far in under the front edge, so only the middle of the front edge is over
   * the player's tray: a medal that goes over within this of either side has
   * gone down the side hole, and is lost as one pushed off the side is.
   *
   * It is what the field gives back. With the sides open and no more, four
   * medals in five that left the field left it by the front, which is far more
   * than a real machine's field returns: there the shop sets the share with
   * the width of the side holes, and about half to six in ten is usual. At
   * this reach the best aim gets about 58 in 100 back from the field, and the
   * rest of what the machine returns is the screen's games (lottery.ts). It
   * was a fifth of the edge, 20, until the medals were made as small as real
   * ones; with them the same reach gave back nearly a point more.
   * It was set here and not by opening the sides further back, because a
   * longer open side takes much less from a field that is fed fast than from
   * one fed slowly, and a hole at the corner takes the same from both:
   * scripts/medal-pusher-tune.ts measures the share for every way of playing.
   */
  sideReach: 20.3,
} as const;

/**
 * Whether a medal that goes over the front edge at `x` drops into the
 * player's tray. It does over the middle of the edge; within the side holes'
 * reach of either side it goes down the hole there instead.
 */
export const frontPays = (x: number): boolean => x >= FIELD.sideReach && x <= FIELD.width - FIELD.sideReach;

/**
 * How big a medal is: a little more than nineteen lie side by side across the
 * field. A real arcade medal is about 25 mm across, a little bigger than a
 * ten-yen coin, and on a real station's table it looks about that small:
 * many deep, with a prize ball half as wide again as one. Everything on the
 * field that has to be sized for a medal is reckoned from this number: the
 * START pockets and the tongues that carry a medal to them, the catcher's
 * well, the side holes, the slots and the rails, the tray, the windows the
 * towers are stacked in, and how close two medals may lie.
 */
export const MEDAL_RADIUS = 2.6;
/**
 * How thick a medal is: a fourteenth of what it is across, which is a real
 * arcade medal's proportion (about 25 mm across and 1.76 mm thick).
 * Everything that has a medal's height in it is reckoned from this number: how
 * high a pile and a tower stand in both pictures, how high a stack in a tube
 * stands, what passes under the catcher's foot, and how far a tower reaches
 * across the lower table when it goes over the lip (`spill`), which is the one
 * place the field's own sums have it in them.
 */
export const MEDAL_THICKNESS = 0.37;

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
 * the three in the middle, about one medal in seven ends up through one when
 * the middle is fed, about one in ten when medals are fed anywhere at all,
 * and about one in thirty-three when they are fed at the edges. The towers
 * the arms set down stand between them (`TUBE.site` in stacker.ts).
 *
 * `halfWidth` is how often a medal starts a spin. With what a spin is worth
 * (`SPIN_TABLE` in lottery.ts) and what the field gives back
 * (`FIELD.sideReach`) it sets what slow play gets back: the best a player
 * can do, feeding the middle a medal every two seconds, is about 90% with
 * average luck on the screen, which is what a real machine is run at, and at
 * two medals a second about 88%. `wingWidth` is how wide a pocket takes
 * medals while its wings are open, which is during chance time. Wings as
 * wide as the pockets were before they were narrowed, 1.7, paid a player for
 * filling the hold. At this width five a second get back about six points
 * less than the best, and both buttons held down about 75%: the screen plays
 * a gold spin in about two seconds, a line and its game included, and at
 * eleven medals a second six in ten of the medals through a pocket find the
 * hold full. scripts/medal-pusher-tune.ts measures all of
 * it, and its table is the one to read before any of these numbers is moved.
 */
export const CHECKERS = { positions: [36, 50, 64], halfWidth: 1.13, wingWidth: 1.25 } as const;

/**
 * Seconds from the lip to the pocket. A medal the lip's rule has counted is
 * not in its pocket yet: it rides its tongue out over the well and drops in
 * this long after it came over, which is what the catcher shows (catcher.ts),
 * and the machine takes it when it drops and not before (session.ts). Which
 * pocket, how wide the pockets were taking medals and where the lucky lamp
 * stood were all settled at the lip.
 */
export const START_RIDE = 0.8;

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
 * Payout medals are thrown onto the pusher across this band, a few per second,
 * out of the slot under the hood. When enough of them are waiting they are
 * poured out of the hopper's doors instead, across the same band (hopper.ts).
 */
export const PAYOUT = { from: 14, to: 86, perSecond: 9 } as const;

/**
 * Medal towers: a big prize is not thrown onto the field but stacked, in
 * towers that ride the pusher like any medal until they are pushed over its
 * lip and come down across the lower table. Each is stacked in a tube in the
 * back wall, in view, and pushed out whole onto the pusher (stacker.ts).
 */
export const TOWER = {
  /** The most medals in one tower: about four and a half times as tall as a medal is wide. */
  max: STACK.most,
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
export const INITIAL = { upper: 112, lower: 200, onTop: { upper: 85, lower: 33 } } as const;
/** Where the balls a machine starts with lie: the first on the lower table, the second on the pusher. */
export const BALL_SPOTS: readonly { level: Level; x: number; y: number }[] = [
  { level: 0, x: 38, y: 70 },
  { level: 1, x: 64, y: 16 },
  { level: 0, x: 66, y: 60 },
];
/** Where the jewels a machine starts with lie, both on the lower table: the first near the front, the second where the hatch throws one. */
export const JEWEL_SPOTS: readonly { level: Level; x: number; y: number }[] = [
  { level: 0, x: 58, y: 86 },
  { level: 0, x: 62, y: 67 },
];
/**
 * Where a jewel from the hatch lands: on the lower table, in the middle of
 * it, between `from` and `to` across and between `near` and `far` out from
 * the back wall, which is in front of the catcher wherever the pusher is. The
 * hatch throws it clear over the pusher, in an arc that takes `time` seconds.
 *
 * It does not come down on the pusher as a prize ball does. The pile on the
 * pusher spreads as it goes, and what lands on it comes off the lip anywhere
 * across the field. With the sides left open to jewels, one in five of those
 * that landed in the middle of the pusher went out of a side, fed slowly down
 * the middle, and seven in ten of those that landed anywhere on it. Held at a
 * side instead, such a jewel lies in the way of the medals going out there.
 * Thrown onto the middle of the lower table, not one of 486 went out of a
 * side in 225,000 medals of play down the middle, beside it, at the edges and
 * with both rails held: a jewel there is not near a side to be held at it,
 * and it still has a third of the table to go before the front.
 */
export const JEWEL_DROP = { from: 42, to: 58, near: 66, far: 72, time: 0.7 } as const;

const R = MEDAL_RADIUS;
const DIAMETER = R * 2;
/** Relaxation passes per step: enough for a pusher that moves a fraction of a unit per step. */
const ITERATIONS = 6;
/**
 * Longer steps are cut into pieces no longer than this, so the pusher never
 * moves far at once. Whoever has something to settle between the pieces cuts
 * its own time the same way and steps the machine a piece at a time: the
 * session does, since what goes through a START slot in one piece can change
 * how wide the slots take medals in the next.
 */
export const MAX_STEP = 1 / 60;

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
  /**
   * Seconds since it dropped from the pusher to the lower table (for drawing
   * the fall and its ride to a pocket); −1 before that. It stops counting at
   * `DROP_COUNTED`.
   */
  sinceDrop: number;
  /** Medals stacked here: 1 for a medal lying on its own, more for a tower. */
  stack: number;
  /** Whether this is a prize ball. It lies among the medals and is pushed like one. */
  ball: boolean;
  /**
   * Set on a jewel, and on nothing else. A jewel is about a medal across and
   * stands taller than one. It lies among the medals and is pushed like one,
   * it is never under or on top of another, it is not part of a tower, and it
   * does not fit a START pocket. Nor does it fit through an open side, which
   * is a slot a medal high, or down a side hole's mouth at a front corner,
   * which is barred: so every jewel the machine lets go is pushed over the
   * front in the end, and how soon is up to the player.
   */
  jewel?: boolean;
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
  /** Set on a jewel on its way down from the hatch. */
  jewel?: boolean;
  /** Seconds until it lands, out of the seconds the whole fall takes. */
  remaining: number;
  duration: number;
  /** Whether the player dropped it, the machine paid it out of the slot, the machine poured it out of the hopper's doors, or it came off a falling tower. */
  source: 'player' | 'payout' | 'pour' | 'spill';
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
  /** The doors a big prize is poured out of, and what they are doing. */
  hopper: Hopper;
  /** The two tubes the towers are stacked in, and their arms. */
  stacker: Stacker;
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

/**
 * How long a medal that came over the lip goes on counting the seconds since
 * (`sinceDrop`), and then stays at. Nothing looks further back than a few
 * seconds: its fall, its ride to a pocket, a ball's roll down the slide. A
 * clock that stops makes every medal that has lain on the lower table a while
 * the same number, which a save writes once for all of them (pack.ts): with
 * medals as small as real ones there are half as many again of them, and the
 * account's copy has to fit.
 */
export const DROP_COUNTED = 5;

/** What happened during a step. */
export interface StepEvents {
  /** Medals that went over the front edge. */
  won: number;
  /** Medals that went down a side hole: out of an open side, or over the front edge at a corner, within the holes' reach. */
  lost: number;
  /** The chucker each medal that went over the lip through one dropped through, one entry per medal. */
  checkers: number[];
  /** Medals that touched down on a table. */
  landed: number;
  /** Towers that went over the pusher's lip. */
  toppled: number;
  /** Balls that went over the front edge. */
  balls: number;
  /** Jewels that went over the front edge. */
  jewels: number;
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

/**
 * How wide the START slots were taking medals as each thing that has come
 * over the lip came over: the half-width the lip's rule had in that piece of
 * the step. The slots can widen or narrow while a medal is still on its way
 * down, and whoever draws it has to show what was counted, so the rule of
 * its own moment is kept with it for as long as the medal is.
 */
const widthAtLip = new WeakMap<Medal, number>();

/**
 * The half-width the START slots had when `medal` came over the lip, or
 * undefined for one the machine did not see come over: a medal that has not
 * come over, and one read back from a save.
 */
export const slotWidthAt = (medal: Medal): number | undefined => widthAtLip.get(medal);

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
/** The towers an arm is pushing out, by id, in the step being worked out: nothing pushes one of them, and no wall stops one. */
const held = new Set<number>();

/** Whether this is something the machine lets go that is not a medal: a prize ball, or a jewel. */
const isPrize = (medal: Pick<Medal, 'ball' | 'jewel'>): boolean => medal.ball || medal.jewel === true;

/** Whether something stands taller than a medal lying flat: a tower, a ball, or a jewel. */
const isTall = (medal: Medal): boolean => isPrize(medal) || medal.stack > 1;

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

/**
 * Pushes two touching medals apart: half the overlap each, or less for a tower and more for what leans on it.
 * A tower on an arm is not moved at all.
 */
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
  const heldA = held.size > 0 && held.has(a.id);
  const heldB = held.size > 0 && held.has(b.id);
  const weightA = heldA ? STACK.hold : a.stack > 1 ? TOWER.weight : 1;
  const weightB = heldB ? STACK.hold : b.stack > 1 ? TOWER.weight : 1;
  const push = (reach - distance) / distance / (weightA + weightB);
  a.x -= dx * push * weightB;
  a.y -= dy * push * weightB;
  b.x += dx * push * weightA;
  b.y += dy * push * weightA;
}

/**
 * Separates every pair of touching medals that lie on the same table and in
 * the same tier. A medal of the upper tier is also kept off whatever stands
 * taller than a medal, since a tower, a ball or a jewel is in its way too.
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
  // No arm holds anything on a machine that is only now being filled, whatever machine was run last.
  held.clear();
  const medals: Medal[] = [];
  for (let i = 0; i < count; i++) {
    const x = R + machine.rng() * (FIELD.width - DIAMETER);
    const y = yFrom + machine.rng() * (yTo - yFrom);
    medals.push({ id: machine.nextId++, x, y, level, tier, sinceDrop: -1, stack: 1, ball: false, grown: 1 });
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
      if (isPrize(other) && distance < DIAMETER * 1.6) return false;
      if (!isPrize(other) && distance < nearest) nearest = distance;
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
 * with `balls` prize balls lying among them (at most BALL_SPOTS.length) and
 * `jewels` jewels (at most JEWEL_SPOTS.length).
 */
export function createMachine(seed: number, balls = 0, jewels = 0): Machine {
  if (!Number.isInteger(balls) || balls < 0 || balls > BALL_SPOTS.length) throw new Error('a machine starts with 0 to 3 balls');
  if (!Number.isInteger(jewels) || jewels < 0 || jewels > JEWEL_SPOTS.length) throw new Error('a machine starts with 0 to 2 jewels');
  const machine: Machine = {
    time: 0,
    medals: [],
    rolling: [],
    falling: [],
    payoutQueue: 0,
    payoutClock: 0,
    hopper: shutHopper(),
    stacker: idleStacker(),
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
  // A ball takes the place of the medal lying nearest its spot, and then a jewel does the same.
  const nearestTo = (spot: { level: Level; x: number; y: number }): Medal | null => {
    let nearest: Medal | null = null;
    let best = Infinity;
    for (const medal of machine.medals) {
      const distance = Math.hypot(medal.x - spot.x, medal.y - spot.y);
      if (medal.level === spot.level && !isPrize(medal) && distance < best) {
        best = distance;
        nearest = medal;
      }
    }
    return nearest;
  };
  for (const spot of BALL_SPOTS.slice(0, balls)) {
    const nearest = nearestTo(spot);
    if (nearest) nearest.ball = true;
  }
  for (const spot of JEWEL_SPOTS.slice(0, jewels)) {
    const nearest = nearestTo(spot);
    if (nearest) nearest.jewel = true;
  }
  // Then the medals lying on top of each pile, once the balls and the jewels are where they will be.
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

/** Queues `count` medals for the machine to pay onto the field: thrown out of the slot, or poured when there are enough of them. */
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

/**
 * Lets a jewel go from the hatch, which throws it over the pusher onto the
 * middle of the lower table. From there it is the field's.
 */
export function dropJewel(machine: Machine): void {
  const x = JEWEL_DROP.from + machine.rng() * (JEWEL_DROP.to - JEWEL_DROP.from);
  const y = JEWEL_DROP.near + machine.rng() * (JEWEL_DROP.far - JEWEL_DROP.near);
  machine.falling.push({ id: machine.nextId++, x, y, level: 0, fromX: x, fromY: RELEASE.depth, rank: 0, ball: false, remaining: JEWEL_DROP.time, duration: JEWEL_DROP.time, source: 'payout', jewel: true });
}

/**
 * Pays `medals` as towers. They are stacked in the tubes in the back wall,
 * and each tower is pushed out onto the pusher once it is built (stacker.ts).
 * With `gather` they go first on top of a tower that is still open, which is
 * how a ball's roulette stacks its numbers onto one tower. What the tubes
 * have no room for is paid loose: poured by the hopper, or thrown out of the
 * slot when it is too few to pour.
 */
export function buildTowers(machine: Machine, medals: number, gather = false): void {
  if (!Number.isInteger(medals) || medals < 0) throw new Error('a payout is a whole number of medals');
  machine.payoutQueue += medals - stackTowers(machine.stacker, medals, gather);
}

/** Every medal the field holds: lying, standing in a tower, in a tube or waiting for one, on a feed arm, in the air, or waiting to be thrown on. Balls and jewels are not medals. */
export function medalsOnField(machine: Machine): number {
  let count = machine.payoutQueue + machine.rolling.length + medalsInTubes(machine.stacker);
  for (const medal of machine.falling) if (!isPrize(medal)) count += 1;
  for (const medal of machine.medals) if (!isPrize(medal)) count += medal.stack;
  return count;
}

/** The balls lying on the field or on their way down to it. */
export function ballsOnField(machine: Machine): number {
  let count = 0;
  for (const medal of machine.falling) if (medal.ball) count += 1;
  for (const medal of machine.medals) if (medal.ball) count += 1;
  return count;
}

/** The jewels lying on the field or on their way down to it. */
export function jewelsOnField(machine: Machine): number {
  let count = 0;
  for (const medal of machine.falling) if (medal.jewel) count += 1;
  for (const medal of machine.medals) if (medal.jewel) count += 1;
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
}

/** Keeps every medal clear of the walls and the pusher's front face, but a tower on an arm, which is where its arm has it. */
function constrain(medals: Medal[], front: number): void {
  for (const medal of medals) {
    if (held.size > 0 && held.has(medal.id)) continue;
    if (medal.level === 1) {
      if (medal.y < R) medal.y = R;
      if (medal.x < R) medal.x = R;
      else if (medal.x > FIELD.width - R) medal.x = FIELD.width - R;
    } else {
      if (medal.y < front + R) medal.y = front + R;
      // The open sides are a slot a medal high: a ball does not fit through, and neither does a jewel.
      if (isPrize(medal) || medal.y < FIELD.sideOpenFrom) {
        if (medal.x < R) medal.x = R;
        else if (medal.x > FIELD.width - R) medal.x = FIELD.width - R;
      }
    }
  }
}

function advance(machine: Machine, dt: number, events: StepEvents, halfWidth: number, gather: boolean): void {
  const before = pusherFront(machine.time);
  machine.time += dt;
  const front = pusherFront(machine.time);
  const carried = front - before;
  machine.waits[0] = Math.max(0, machine.waits[0] - dt);
  machine.waits[1] = Math.max(0, machine.waits[1] - dt);

  // The machine pays its medals onto the pusher: poured out of the hopper's doors when enough are waiting,
  // and otherwise thrown out of the slot under the hood, a few per second.
  if (runHopper(machine, dt, LANDING, RELEASE.depth)) {
    // The slot throws nothing while the doors are anything but shut.
  } else if (machine.payoutQueue > 0) {
    machine.payoutClock += dt * PAYOUT.perSecond;
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

  // The tubes stack their towers a medal at a time, let them down, and push them out onto the pusher.
  runStacker(machine, dt, front, gather);

  // Medals in the air come down: off an arm or down the back panel onto the pusher, off a tower onto the lower table.
  if (machine.falling.length > 0) {
    const stillFalling: FallingMedal[] = [];
    for (const medal of machine.falling) {
      medal.remaining -= dt;
      if (medal.remaining > 0) {
        stillFalling.push(medal);
        continue;
      }
      // It lies on the table where there is room for it, and on top of the others where there is not. A ball or a jewel always makes room.
      const tier: Tier = isPrize(medal) || roomBelow(machine.medals, medal.level, medal.x, medal.y) ? 0 : 1;
      const landed: Medal = { id: medal.id, x: medal.x, y: medal.y, level: medal.level, tier, sinceDrop: -1, stack: 1, ball: medal.ball, grown: SETTLE.from };
      if (medal.jewel) landed.jewel = true;
      machine.medals.push(landed);
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
    else if (medal.sinceDrop >= 0) medal.sinceDrop = Math.min(DROP_COUNTED, medal.sinceDrop + dt);
    if (medal.grown < 1) medal.grown = Math.min(1, medal.grown + settle);
  }
  // A tower on an arm is where its arm has it, and nothing that leans on it moves it.
  holdTowers(machine, front, held);
  constrain(machine.medals, front);
  buildGrid(machine.medals);
  for (let i = 0; i < ITERATIONS; i++) {
    separate(machine.medals);
    constrain(machine.medals, front);
  }
  settleUpperTier(machine.medals);
  constrain(machine.medals, front);

  // Over the lip, over the front edge, or out of an open side. A medal that goes over the front edge is won
  // over the middle of it and lost within the side holes' reach of a corner. A medal that goes over the lip where
  // a chucker is drops through it. A tower that goes over there sends every one of its medals
  // through, one after another; a ball is too big for one, and a jewel stands too tall.
  const kept: Medal[] = [];
  const crossing: Medal[] = [];
  for (const medal of machine.medals) {
    if (medal.level === 1) {
      if (medal.y > front) {
        const checker = isPrize(medal) ? -1 : checkerAt(medal.x, halfWidth);
        for (let n = 0; checker >= 0 && n < medal.stack; n++) events.checkers.push(checker);
        if (medal.stack > 1) {
          spill(machine, medal, front);
          events.toppled++;
        } else {
          crossing.push(medal);
          widthAtLip.set(medal, halfWidth);
        }
        continue;
      }
      kept.push(medal);
    } else if (medal.y > FIELD.depth) {
      // A ball or a jewel is collected wherever it goes over: across each side hole's mouth lies a ball rail
      // (sidehole.ts). A medal tips over the edge and drops short of its first bar; a prize that goes over at a
      // corner comes down on the bars and rolls along them into the tray.
      if (medal.jewel) events.jewels++;
      else if (medal.ball) events.balls++;
      else if (frontPays(medal.x)) events.won++;
      else events.lost++;
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
    medal.tier = isPrize(medal) || roomBelow(kept, 0, medal.x, medal.y) ? 0 : 1;
    medal.level = 0;
    medal.sinceDrop = 0;
    medal.grown = SETTLE.from;
    kept.push(medal);
  }
  machine.medals = kept;
}

/**
 * Moves the machine forward by `dt` seconds and reports what happened. With
 * `wings` the START pockets take medals at their wider width; with `gather`
 * a tower that is built and has room on top waits in its tube for more.
 */
export function step(machine: Machine, dt: number, wings = false, gather = false): StepEvents {
  if (!(dt >= 0) || !Number.isFinite(dt)) throw new Error('the time step must be a non-negative number');
  const events: StepEvents = { won: 0, lost: 0, checkers: [], landed: 0, toppled: 0, balls: 0, jewels: 0 };
  let remaining = dt;
  while (remaining > 1e-9) {
    const piece = Math.min(MAX_STEP, remaining);
    advance(machine, piece, events, wings ? CHECKERS.wingWidth : CHECKERS.halfWidth, gather);
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
