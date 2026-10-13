/**
 * The machine between visits. In an arcade the medals are banked and found
 * again next time; here the whole machine is written down as text and read
 * back: the field with every medal on it, the purse, the counters, the
 * jackpot and whatever the screen was in the middle of.
 *
 * This file only turns a session into text and back. It never touches the
 * browser: the cabinet does the reading and the writing.
 *
 * What comes back out of storage is not trusted. It may have been written by
 * an older version of the game, cut short, damaged, or edited by hand, so
 * every value is checked before a machine is built from it: its type, its
 * range, that it agrees with the tables in lottery.ts, and that whatever the
 * screen shows is at a moment the machine really passes through. A save that
 * fails is refused as a whole and the cabinet starts a new machine. The one
 * exception is the screen, described at `restore`.
 *
 * To store a new field, add it to `Machine`, `Session` or one of the things
 * the screen shows: this file then stops compiling until the field has a
 * check in the matching list below. A save written before the field existed
 * lacks it and is refused: as a whole if the field is the machine's or the
 * session's, and the one thing on the screen if the field is its own. Players
 * have saves now, so a field added to the machine or the session also takes a
 * new STORAGE_VERSION and a reader for the version before it, which says what
 * a machine without the field is in today's terms (see `fieldBeforeArms`).
 * Raise the version, too, when a stored value changes its meaning without
 * changing its shape.
 *
 * Saves written before a reach had a kind and before the roulette had its bowl
 * were read without a version of their own: nothing else about the machine had
 * changed shape or meaning, so such a save is the machine it was, less the
 * spin or the roulette it was in the middle of, which is not one this game can
 * show. None was ever written outside development.
 *
 * Version 1 is the machine before its feed arms, when a medal was in the air
 * from the moment it was dropped. Version 2 adds the arms: where they are
 * pointed, where each tip has got to, and the medals on their rails. In that
 * version the two arms shared one slot and one aim. Version 3 gives each arm
 * its own: an aim for each, and a wait for each slot. Version 4 adds chance
 * time to the session's numbers: how many of the held spins are gold, how many
 * there have been, and whether the screen is on one. Each version's field and
 * numbers are held to their own exact shape, so an older save comes back as
 * the machine it was, and one that has been given a field or a number of
 * another version is not a save of any.
 *
 * Version 5 changes neither the field nor the numbers. In the versions before
 * it a full run ended in one bowl with a hole for each prize; now it ends in
 * three bowls, one under another, and the ball in them is written down as the
 * way it goes and the bowl it has got to. An older save's ball is read as that
 * game wrote it and comes back in today's bowls (see `ballInOneBowl`).
 *
 * Version 6 adds jewels: the ones lying on the field or on their way to it,
 * the jewel lamps that are lit, and the bonuses they have paid. A save of any
 * version before it comes back as a machine with no jewel on it and no lamp
 * lit, and one of them that claims a jewel is not a save of its version.
 */

import {
  AIM,
  ARM_REACH,
  DROP_INTERVAL,
  FIELD,
  MEDAL_RADIUS,
  ROLL_TIME,
  SETTLE,
  TOWER,
  armStart,
  seededRng,
  tipOf,
  type FallingMedal,
  type Machine,
  type Medal,
  type RollingMedal,
} from './engine';
import {
  BOARD,
  BOWL,
  BOWLS,
  CHAIN_GOAL,
  CHANCE,
  CHESTS,
  DIE_FACES,
  FALLS,
  JACKPOT_START,
  JACKPOT_STEP,
  JEWEL,
  REACH_KINDS,
  ROULETTE,
  TIERS,
  TIER_DIGITS,
  fallEnd,
  holePays,
  squareAfter,
  type Hole,
  type SpinResult,
  type Tier,
} from './lottery';
import {
  BOWL_TIMES,
  MAX_STOCK,
  TIMING,
  bowlShowTime,
  reachTime,
  sugorokuDuration,
  type ActiveBonus,
  type ActiveBowl,
  type ActiveChest,
  type ActiveRoulette,
  type ActiveSpin,
  type ActiveSugoroku,
  type Session,
} from './session';

export const STORAGE_KEY = 'medal-pusher-machine';
/** The version every save is written with. */
export const STORAGE_VERSION = 6;
/**
 * The version the game wrote before it had jewels: three bowls and chance
 * time. Its field is today's with no jewel on it, and its numbers are today's
 * but for the lamps and the bonuses.
 */
export const VERSION_BEFORE_JEWELS = 5;
/**
 * The version the game wrote while a full run ended in one bowl and chance
 * time was already in it. Its field and its numbers are those of the version
 * after it; what differs is how the ball in the bowl is written down.
 */
export const VERSION_WITH_ONE_BOWL = 4;
/**
 * The version the game wrote before chance time: a medal that found the hold
 * full was only wasted, and no spin was ever gold. Its field is that of the
 * versions after it; what it lacks is three of the session's numbers.
 */
export const VERSION_BEFORE_CHANCE = 3;
/** The version the game wrote while its two arms shared one slot and one aim. */
export const VERSION_WITH_ONE_AIM = 2;
/** The version the game wrote before it had its feed arms. A save carrying any number but these six is refused. */
export const VERSION_BEFORE_ARMS = 1;

/**
 * The bounds a save has to keep within. Play stays far inside them. They are
 * there so that a damaged save cannot hand the machine a number it would
 * choke on, or more medals than it could ever hold.
 */
export const LIMITS = {
  /** Medals lying on the two tables. Packed two deep with every tower standing, they hold about 650. */
  medals: 1000,
  /** Medals on their way in, at a slot or on an arm's rail: as many as the two slots can feed in the time one takes to get to the tip. */
  rolling: 2 * Math.ceil(ROLL_TIME / DROP_INTERVAL),
  /** Medals in the air. Every tower coming down at once is 450. */
  falling: 600,
  /** Prize balls, on the field or waiting for their roulette. */
  balls: 50,
  /** Jewels on the field. One comes with a treasure line and each is pushed off in the end, so there are seldom more than two or three. */
  jewels: 50,
  /** Medals in one place: the purse, the jackpot, a payout still to be thrown on. */
  purse: 1_000_000,
  /** Anything counted since the machine was switched on, the medals' ids included. */
  count: 1_000_000_000_000,
  /** The machine's own clock, in seconds: about thirty years. */
  clock: 1_000_000_000,
  /** No timer on the machine runs for longer than a minute. */
  timer: 60,
  /** How far outside the field a position may be, in field units. */
  margin: MEDAL_RADIUS * 2,
  /** The longest text that is read at all. A machine filled to the bounds above comes to about a quarter of it. */
  length: 1_000_000,
} as const;

// ── Checks ──────────────────────────────────────────────────────────────────

/** A check takes a stored value and gives it back with its type known, or `undefined` when it is not what it should be. */
type Check<T> = (value: unknown) => T | undefined;

/** A whole number from `min` to `max`. */
const whole =
  (min: number, max: number): Check<number> =>
  (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;

/** Any number from `min` to `max`. NaN and the infinities are in no range. */
const real =
  (min: number, max: number): Check<number> =>
  (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;

const flag: Check<boolean> = (value) => (typeof value === 'boolean' ? value : undefined);

/** One of the values listed. */
const oneOf =
  <const T extends readonly (string | number)[]>(options: T): Check<T[number]> =>
  (value) =>
    options.includes(value as T[number]) ? (value as T[number]) : undefined;

/** At most `max` items, each passing `item`. */
const list =
  <T>(item: Check<T>, max: number): Check<T[]> =>
  (value) => {
    if (!Array.isArray(value) || value.length > max) return undefined;
    const items: T[] = [];
    for (const entry of value) {
      const checked = item(entry);
      if (checked === undefined) return undefined;
      items.push(checked);
    }
    return items;
  };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * An object with exactly the fields listed, no more and no fewer, each passing
 * its own check, and then `agrees`, which looks at them together. Every field
 * of `T` has to be listed, which is what keeps this file in step with the game.
 */
function shape<T>(fields: { [K in keyof T]-?: Check<T[K]> }, agrees: (value: T) => boolean = () => true): Check<T> {
  const keys = Object.keys(fields) as (keyof T & string)[];
  return (value) => {
    if (!isRecord(value) || Object.keys(value).length !== keys.length) return undefined;
    const checked = {} as T;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
      const field = fields[key](value[key]);
      if (field === undefined) return undefined;
      checked[key] = field;
    }
    return agrees(checked) ? checked : undefined;
  };
}

/** Something counted: never negative, never a fraction. */
const count = whole(0, LIMITS.count);
/** Seconds on one of the machine's short timers. */
const timer = real(0, LIMITS.timer);
/** The seconds something takes. The screen divides by them, so never zero. */
const lasting = real(0.01, LIMITS.timer);
/** A place on the field, or just beside it: across, and from the back wall to the front. */
const across = real(-LIMITS.margin, FIELD.width + LIMITS.margin);
const along = real(-LIMITS.margin, FIELD.depth + LIMITS.margin);
const level = oneOf([0, 1]);

// ── The field ───────────────────────────────────────────────────────────────

/** Only `true` will do: what is not a jewel is stored without the field. */
const set: Check<true> = (value) => (value === true ? true : undefined);

/** What a medal, a ball or a tower is stored as, in every version. */
const lying = {
  id: whole(1, LIMITS.count),
  x: across,
  y: along,
  level,
  tier: oneOf([0, 1]),
  sinceDrop: real(-1, LIMITS.clock),
  stack: whole(1, TOWER.max),
  grow: whole(0, TOWER.max - 1),
  ball: flag,
  grown: real(SETTLE.from, 1),
};

/** A medal, a ball or a tower: the only things that lay on the field before there were jewels. */
const plainMedal = shape<Omit<Medal, 'jewel'>>(
  lying,
  // A tower is never taller than the tallest, and a ball is not a tower.
  (m) => m.stack + m.grow <= TOWER.max && (!m.ball || m.stack + m.grow === 1),
);

/**
 * A jewel is stored as a medal that says it is one, and is neither a ball
 * nor a tower, nor lying on top of anything. Whatever is not a jewel is
 * stored without the field, exactly as it was before there were jewels.
 */
const jewelMedal = shape<Required<Medal>>({ ...lying, jewel: set }, (m) => !m.ball && m.stack === 1 && m.grow === 0 && m.tier === 0);

const medal: Check<Medal> = (value) => (isRecord(value) && 'jewel' in value ? jewelMedal(value) : plainMedal(value));

/**
 * A medal on its way in. What is stored is how long it has to go to the tip of its arm, which means what it
 * always meant. The way grew longer when the arms were made to run back from slots at the front corners, so a
 * save from before then has every such medal within its last half second: on its rail, about a third of the way
 * along it or further. It reads as it is, and the version did not have to change.
 */
const rollingMedal = shape<RollingMedal>({
  id: whole(1, LIMITS.count),
  arm: oneOf([0, 1]),
  remaining: real(0, ROLL_TIME),
});

/** What something in the air is stored as, in every version. */
const inAir = {
  id: whole(1, LIMITS.count),
  x: across,
  y: along,
  level,
  fromX: across,
  fromY: along,
  rank: whole(0, TOWER.max - 1),
  ball: flag,
  remaining: timer,
  duration: lasting,
  source: oneOf(['player', 'payout', 'spill'] as const),
};

const plainFalling = shape<Omit<FallingMedal, 'jewel'>>(inAir, (m) => m.remaining <= m.duration);

/** A jewel in the air is one the machine has let go: on its way to the lower table, and not a ball. */
const jewelFalling = shape<Required<FallingMedal>>({ ...inAir, jewel: set }, (m) => m.remaining <= m.duration && !m.ball && m.source === 'payout' && m.level === 0 && m.rank === 0);

const fallingMedal: Check<FallingMedal> = (value) => (isRecord(value) && 'jewel' in value ? jewelFalling(value) : plainFalling(value));

/**
 * Two places across the field, one for each arm and the left arm's first:
 * each within its own arm's reach, and the left one never to the right of
 * the right one. That holds for where the arms are pointed, since the rails
 * do not cross, and so for where their tips are: both swing at one speed
 * and neither overshoots, so they cannot pass each other on the way.
 */
const acrossArms: Check<[number, number]> = (value) => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const left = real(ARM_REACH[0].min, ARM_REACH[0].max)(value[0]);
  const right = real(ARM_REACH[1].min, ARM_REACH[1].max)(value[1]);
  return left === undefined || right === undefined || left > right ? undefined : [left, right];
};

/** How long each arm's slot still has to wait, the left arm's first. */
const waits: Check<[number, number]> = (value) => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const left = real(0, DROP_INTERVAL)(value[0]);
  const right = real(0, DROP_INTERVAL)(value[1]);
  return left === undefined || right === undefined ? undefined : [left, right];
};

/** The field as it is stored: everything but the generator. */
type StoredMachine = Omit<Machine, 'rng'>;
/** The field as version 2 stored it: one slot's wait and one aim for both arms. */
type MachineWithOneAim = Omit<StoredMachine, 'waits' | 'aims'> & { cooldown: number; aim: number };
/** The field as version 1 stored it: no arms, so nothing on a rail, no aim and no tips. */
type MachineBeforeArms = Omit<MachineWithOneAim, 'rolling' | 'aim' | 'tips'>;

/**
 * How closely the medals on the rails are held to a slot's pace, in seconds.
 * A slot takes its own wait as over a billionth of a second before its end.
 */
const SLACK = 1e-6;

/** What every version of the field holds. Before version 6 nothing on it or over it is a jewel. */
const tables = {
  time: real(0, LIMITS.clock),
  medals: list<Medal>(plainMedal, LIMITS.medals),
  falling: list<FallingMedal>(plainFalling, LIMITS.falling),
  payoutQueue: whole(0, LIMITS.purse),
  payoutClock: timer,
  growing: whole(0, LIMITS.medals * TOWER.max),
  towerClock: timer,
  nextId: whole(1, LIMITS.count),
};
const rolling = list(rollingMedal, LIMITS.rolling);
/** The one wait and the one aim of the versions before each arm had its own. */
const oneSlot = { cooldown: real(0, DROP_INTERVAL) };
const oneAim = { aim: real(AIM.min, AIM.max) };

/** What has to agree in any field, whatever feeds it. */
function tablesAgree(machine: Pick<StoredMachine, 'medals' | 'falling' | 'growing' | 'nextId'>, onRails: RollingMedal[]): boolean {
  // Every medal has an id of its own, lower than the next one to be given out.
  const ids = new Set<number>();
  for (const { id } of [...machine.medals, ...onRails, ...machine.falling]) {
    if (id >= machine.nextId || ids.has(id)) return false;
    ids.add(id);
  }
  const balls = [...machine.medals, ...machine.falling].filter((m) => m.ball).length;
  const jewels = [...machine.medals, ...machine.falling].filter((m) => m.jewel).length;
  // The medals still to be stacked are the ones the towers are waiting for.
  const growing = machine.medals.reduce((sum, m) => sum + m.grow, 0);
  return growing === machine.growing && balls <= LIMITS.balls && jewels <= LIMITS.jewels;
}

/**
 * Whether medals fed through one slot, in the order they were fed, keep to that slot's pace. A slot feeds one
 * medal and then waits. So the last medal fed has been on its way for as long as the slot has been waiting, or
 * longer, and each one before it for a whole wait more.
 */
function keepsPace(fed: RollingMedal[], wait: number): boolean {
  let most = ROLL_TIME - DROP_INTERVAL + wait;
  for (let i = fed.length - 1; i >= 0; i--) {
    if (fed[i].remaining > most + SLACK) return false;
    most = fed[i].remaining - DROP_INTERVAL;
  }
  return true;
}

const storedMachine = shape<StoredMachine>(
  // In the order a machine holds them, which is the order they are written in: a machine read back and
  // written again is the same text.
  {
    time: tables.time,
    medals: list(medal, LIMITS.medals),
    rolling,
    falling: list(fallingMedal, LIMITS.falling),
    payoutQueue: tables.payoutQueue,
    payoutClock: tables.payoutClock,
    growing: tables.growing,
    towerClock: tables.towerClock,
    waits,
    aims: acrossArms,
    tips: acrossArms,
    nextId: tables.nextId,
  },
  // Each arm's slot keeps its own pace: what is on one rail says nothing about the other.
  (machine) =>
    tablesAgree(machine, machine.rolling) &&
    keepsPace(
      machine.rolling.filter((m) => m.arm === 0),
      machine.waits[0],
    ) &&
    keepsPace(
      machine.rolling.filter((m) => m.arm === 1),
      machine.waits[1],
    ),
);

/** Builds today's field from the parts of an older one, in the order a machine holds them, and checks it as a whole. */
const asStored = (field: Pick<StoredMachine, keyof typeof tables>, rest: Pick<StoredMachine, 'rolling' | 'waits' | 'aims' | 'tips'>): StoredMachine | undefined => {
  const { time, medals, falling, payoutQueue, payoutClock, growing, towerClock, nextId } = field;
  return storedMachine({ time, medals, rolling: rest.rolling, falling, payoutQueue, payoutClock, growing, towerClock, waits: rest.waits, aims: rest.aims, tips: rest.tips, nextId });
};

/**
 * The field of a save of versions 3 to 5. It is today's field in every part,
 * and has no jewel on it: those games had none, and a save of theirs that
 * claims one is not a save of theirs.
 */
const fieldBeforeJewels: Check<StoredMachine> = (value) => {
  const field = shape<StoredMachine>({ ...tables, rolling, waits, aims: acrossArms, tips: acrossArms })(value);
  return field && asStored(field, field);
};

// In version 2 one slot fed both rails, so the medals on the two rails together keep one slot's pace.
const machineWithOneAim = shape<MachineWithOneAim>(
  { ...tables, rolling, ...oneSlot, ...oneAim, tips: acrossArms },
  (machine) => tablesAgree(machine, machine.rolling) && keepsPace(machine.rolling, machine.cooldown),
);

/**
 * The field of a version-2 save, as today's machine. That game pointed both
 * arms with one aim: each arm's tip went over it as far as the arm reached,
 * when the aim was on its side or a medal was on its rail, and to a resting
 * place otherwise. So each arm's aim is that one aim, as near as the arm can
 * point to it: an arm that was following it goes on doing so, and a medal on
 * its rail leaves from where it was going to. An arm that was at rest swings
 * over, with nothing on its rail to mind. Its one slot fed either rail, so
 * neither slot is free until that one would have been.
 */
const fieldWithOneAim: Check<StoredMachine> = (value) => {
  const field = machineWithOneAim(value);
  return field && asStored(field, { rolling: field.rolling, waits: [field.cooldown, field.cooldown], aims: [tipOf(0, field.aim), tipOf(1, field.aim)], tips: field.tips });
};

const machineBeforeArms = shape<MachineBeforeArms>({ ...tables, ...oneSlot }, (machine) => tablesAgree(machine, []));

/**
 * The field of a version-1 save, as today's machine. That game had no arms: a
 * medal was in the air, with its landing spot, from the moment it was dropped.
 * So whatever such a save holds in the air is already in its fall, and lands
 * where and when it was going to, whatever the arms do; nothing is on a rail;
 * and with no aim to bring back, the arms are where a new machine's are, each
 * pointing a little to its own side of the middle. Neither slot is free until
 * the one that game had would have been.
 */
const fieldBeforeArms: Check<StoredMachine> = (value) => {
  const field = machineBeforeArms(value);
  return field && asStored(field, { rolling: [], waits: [field.cooldown, field.cooldown], aims: [armStart(0), armStart(1)], tips: [armStart(0), armStart(1)] });
};

// ── The purse and the counters ──────────────────────────────────────────────

/** What the screen is in the middle of. At most one of the three is on at a time. */
type OnScreen = Pick<Session, 'spin' | 'bonus' | 'roulette'>;
/** The session's own numbers: everything but the field and the screen. */
type StoredNumbers = Omit<Session, 'machine' | keyof OnScreen>;

/** The numbers every version of the session holds, in two runs: chance time's three go between them. */
const purse = {
  credits: whole(0, LIMITS.purse),
  inserted: count,
  won: count,
  lost: count,
  paidOut: count,
  stock: whole(0, MAX_STOCK),
};
const counters = {
  hits: count,
  wasted: count,
  jackpot: whole(JACKPOT_START, LIMITS.purse),
  jackpotProgress: whole(0, JACKPOT_STEP - 1),
  square: whole(0, BOARD.length - 1),
  balls: whole(0, LIMITS.balls),
  roulettes: count,
  spins: count,
  tiers: shape<Record<Tier, number>>({ miss: count, small: count, big: count, seven: count }),
  fevers: count,
  jackpots: count,
  refills: count,
  quickPick: flag,
};

/** Only a held spin can be gold, and each gold spin was a medal that found the hold full: the ones still held,
 * and the one on the screen if the screen is on one. So a screen is never gold on a machine no medal has gilded. */
const goldAddsUp = (numbers: Pick<StoredNumbers, 'gold' | 'stock' | 'gilded' | 'wasted' | 'chance'>): boolean =>
  numbers.gold <= numbers.stock && numbers.gilded <= numbers.wasted && numbers.gold + (numbers.chance ? 1 : 0) <= numbers.gilded;

/** Chance time's three numbers, which go between the purse and the counters. */
const gilding = { gold: whole(0, MAX_STOCK), gilded: count, chance: flag };

const storedNumbers = shape<StoredNumbers>(
  // In the order a session holds them, which is the order they are written in. Of the jewel lamps never all are lit:
  // the last one pays the bonus and puts them out.
  { ...purse, ...gilding, ...counters, jewels: whole(0, JEWEL.lamps - 1), jewelBonuses: count },
  goldAddsUp,
);

/** The session's numbers as the versions with chance time and without jewels stored them. */
type NumbersBeforeJewels = Omit<StoredNumbers, 'jewels' | 'jewelBonuses'>;
const numbersWithoutJewels = shape<NumbersBeforeJewels>({ ...purse, ...gilding, ...counters }, goldAddsUp);

/** The numbers of a save from before there were jewels, as today's: no lamp lit, and no bonus paid. */
const numbersBeforeJewels: Check<StoredNumbers> = (value) => {
  const kept = numbersWithoutJewels(value);
  return kept && storedNumbers({ ...kept, jewels: 0, jewelBonuses: 0 });
};

/** The session's numbers as the versions before chance time stored them. */
type NumbersBeforeChance = Omit<NumbersBeforeJewels, 'gold' | 'gilded' | 'chance'>;
const numbersWithoutChance = shape<NumbersBeforeChance>({ ...purse, ...counters });

/**
 * The numbers of a save written before chance time, as today's. That game had
 * no gold spins: none of the spins it holds is gold, no medal has ever turned
 * one, and what is on its screen is an ordinary spin or the game one led to.
 * The medals it wasted on a full hold stay wasted. It had no jewels either.
 */
const numbersBeforeChance: Check<StoredNumbers> = (value) => {
  const old = numbersWithoutChance(value);
  if (!old) return undefined;
  const { credits, inserted, won, lost, paidOut, stock, ...rest } = old;
  return storedNumbers({ credits, inserted, won, lost, paidOut, stock, gold: 0, gilded: 0, chance: false, ...rest, jewels: 0, jewelBonuses: 0 });
};

// ── The screen ──────────────────────────────────────────────────────────────
//
// Each thing the screen shows goes through a few phases, and `advance` in
// session.ts leaves it in one of them every time it returns. The cabinet saves
// between two calls, so something that is in none of its phases was not
// written by this game — and letting it through would make the machine do
// something twice: count a line again, pay a prize again. The checks below
// accept exactly the phases listed above each of them. A clock is compared
// with its thresholds the way `advance` compares them, with the same sums, so
// a clock that stands exactly on a threshold is past it here as it is there.

/** Three digits, each one a reel can show. */
const digits: Check<[number, number, number]> = (value) => {
  const reels = list(whole(1, 9), 3)(value);
  return reels?.length === 3 ? [reels[0], reels[1], reels[2]] : undefined;
};

const spinResult = shape<SpinResult>(
  { tier: oneOf(TIERS), digits, reach: flag, reachKind: oneOf(REACH_KINDS) },
  ({ tier, digits: [left, centre, right], reach, reachKind }) => {
    // A winning tier shows three of one of its own digits and a miss is not a line. A reach is the
    // two outer reels alike, and it is played one way or the other exactly when there is one.
    const line = left === centre && centre === right;
    return reach === (left === right) && reach === (reachKind !== 'none') && (tier === 'miss' ? !line : line && TIER_DIGITS[tier].includes(left));
  },
);

/**
 * A spin. Its reels take one of the machine's two spin times, or a gold
 * spin's own when it is one (`gold`), and on top the suspense of its reach:
 * none, the usual, or the long one.
 *
 *   reels running   elapsed < duration                         not done
 *   line held up    duration ≤ elapsed < duration + celebrate  done
 *
 * Only a winning line is held up. A miss is taken off in the step its reels
 * stop, so it is never seen done.
 */
const activeSpin = (gold: boolean) =>
  shape<ActiveSpin>({ result: spinResult, elapsed: timer, duration: lasting, done: flag }, (spin) => {
    const suspense = reachTime(spin.result);
    if (gold ? spin.duration !== TIMING.chanceSpin + suspense : spin.duration !== TIMING.spin + suspense && spin.duration !== TIMING.quickSpin + suspense) return false;
    return spin.done === spin.elapsed >= spin.duration && spin.elapsed < spin.duration + (spin.result.tier === 'miss' ? 0 : TIMING.celebrate);
  });

/**
 * A roll on the board: the die, then a hop for each square. `square` is where
 * the session has the piece standing.
 *
 *   die and hops    elapsed < duration                         unpaid, the piece still on `from`
 *   prize shown     duration ≤ elapsed < duration + prize      paid what the square it reached holds, the piece on that square
 *
 * A gold spin's roll pays `pays` times what the square holds.
 */
const activeSugoroku = (square: number, pays: number) =>
  shape<ActiveSugoroku>(
    {
      kind: oneOf(['sugoroku']),
      roll: whole(1, DIE_FACES),
      from: whole(0, BOARD.length - 1),
      elapsed: timer,
      duration: lasting,
      payout: whole(-1, LIMITS.purse),
    },
    (b) => {
      if (b.duration !== sugorokuDuration(b.roll) || b.elapsed >= b.duration + TIMING.prize) return false;
      const reached = squareAfter(b.from, b.roll);
      return b.elapsed >= b.duration ? b.payout === BOARD[reached] * pays && square === reached : b.payout === -1 && square === b.from;
    },
  );

const inOrder = (medals: readonly number[]): string => [...medals].sort((a, b) => a - b).join();

/**
 * A choice of chests, which hold the three prizes in some order. `quickPick`
 * is whether the session picks the moment a chest is offered.
 *
 *   choosing        nothing picked, told or paid; elapsed < choose
 *   just picked     picked by the player since the last step: pickedAt = elapsed, not yet told, unpaid
 *   picked          told, unpaid; pickedAt ≤ elapsed < pickedAt + open
 *   open            told, paid what the picked chest holds; pickedAt + open ≤ elapsed < pickedAt + open + prize
 *
 * The clock picks when the time to choose is up, and only ever its own chest;
 * the player picks before that. A machine that picks at once has no time to
 * choose in: its clock picks on the first step, so it is only seen choosing
 * at 0, and only there can the player get in first.
 */
const activeChest = (quickPick: boolean, pays: number) =>
  shape<ActiveChest>(
    {
      kind: oneOf(['chest']),
      prizes: list(whole(0, LIMITS.purse), CHESTS.length),
      fallback: whole(0, CHESTS.length - 1),
      picked: whole(-1, CHESTS.length - 1),
      elapsed: timer,
      pickedAt: real(-1, LIMITS.timer),
      told: flag,
      payout: whole(-1, LIMITS.purse),
    },
    (c) => {
      if (inOrder(c.prizes) !== inOrder(CHESTS)) return false;
      if (c.picked < 0) return c.pickedAt === -1 && !c.told && c.payout === -1 && (quickPick ? c.elapsed === 0 : c.elapsed < TIMING.choose);
      if (c.pickedAt < 0 || c.pickedAt > c.elapsed) return false;
      const byClock = quickPick ? c.pickedAt > 0 : c.pickedAt >= TIMING.choose;
      if (byClock && c.picked !== c.fallback) return false;
      if (!c.told) return !byClock && c.pickedAt === c.elapsed && c.payout === -1;
      const open = c.elapsed >= c.pickedAt + TIMING.open;
      return c.payout === (open ? c.prizes[c.picked] * pays : -1) && c.elapsed < c.pickedAt + TIMING.open + TIMING.prize;
    },
  );

const activeBonus =
  ({ square, quickPick, chance }: StoredNumbers): Check<ActiveBonus> =>
  (value) =>
    activeSugoroku(square, chance ? CHANCE.multiplier : 1)(value) ?? activeChest(quickPick, chance ? CHANCE.multiplier : 1)(value);

/** The numbers on the wheel, and what a run can have come to after none of them, one, two … up to one short of the goal. */
const NUMBERS = [...new Set(ROULETTE.filter((pocket): pocket is number => pocket !== 'stop'))];
const RUN_TOTALS: ReadonlySet<number>[] = [new Set([0])];
for (let length = 1; length < CHAIN_GOAL; length++) {
  RUN_TOTALS.push(new Set([...RUN_TOTALS[length - 1]].flatMap((sum) => NUMBERS.map((medals) => sum + medals))));
}

/** The ball in the bowls as a run sees it: still on its way down, or dropped for good into a hole that paid. */
type Ball = { dropped: false } | { dropped: true; hole: Hole; payout: number };

/** A roulette without its bowls, which each version writes down in its own way. */
type Run = Omit<ActiveRoulette, 'bowl'>;
const run = {
  pocket: whole(0, ROULETTE.length - 1),
  from: whole(0, ROULETTE.length - 1),
  elapsed: timer,
  duration: lasting,
  landed: flag,
  level: whole(0, CHAIN_GOAL),
  total: count,
  gain: whole(0, LIMITS.purse),
  over: flag,
  jackpot: flag,
};

/**
 * Whether a roulette is at a moment the machine passes through. `ball` is the
 * ball in the bowls, when the run has got that far; whether the ball's own
 * clock is in order is for the version that wrote it to say.
 *
 *   turning         no ball; not landed; elapsed < duration; gain 0; fewer numbers than the goal
 *   on a number     no ball; landed; duration ≤ elapsed < duration + step; gain that number; 1 … goal numbers
 *   on a cross      no ball; landed and over; duration ≤ elapsed < duration + prize; gain 0; fewer numbers than the goal
 *   ball on its way the run as its last number left it, a step or more ago: landed, the goal reached,
 *                   not over; gain 0
 *   ball dropped    the run over, a jackpot exactly when the hole is the jackpot's; gain what the hole paid
 *
 * The goal is reached on a number like any other, and the ball goes into the
 * top bowl one step later. `from` is where the light set off from: pocket 0 on
 * the first turn, and after that the number it last stopped on. `total` is what
 * the numbers so far have come to, with the bowls' prize on top once the ball
 * has dropped for good. The jackpot's hole paid the jackpot as it then stood,
 * which the save no longer holds: all that can be told is that it was no less
 * than a jackpot starts at.
 */
function runAgrees(r: Run, ball: Ball | null): boolean {
  if (r.duration !== TIMING.roulette) return false;
  const pocket = ROULETTE[r.pocket];
  // The numbers the run had behind it before this turn's pocket, and what they had come to.
  let behind = r.level;
  let paid = r.total;
  if (ball) {
    if (!r.landed || pocket === 'stop' || r.level !== CHAIN_GOAL || r.elapsed < r.duration + TIMING.step) return false;
    behind -= 1;
    paid -= pocket;
    if (!ball.dropped) {
      if (r.over || r.jackpot || r.gain !== 0) return false;
    } else {
      const held = ball.hole === 'jackpot' ? ball.payout >= JACKPOT_START : ball.payout === holePays(ball.hole, JACKPOT_START);
      if (!held || !r.over || r.jackpot !== (ball.hole === 'jackpot') || r.gain !== ball.payout) return false;
      paid -= ball.payout;
    }
  } else if (!r.landed) {
    if (r.over || r.jackpot || r.gain !== 0 || r.level >= CHAIN_GOAL || r.elapsed >= r.duration) return false;
  } else if (r.elapsed < r.duration) {
    return false;
  } else if (pocket === 'stop') {
    if (!r.over || r.jackpot || r.gain !== 0 || r.level >= CHAIN_GOAL || r.elapsed >= r.duration + TIMING.prize) return false;
  } else {
    if (r.over || r.jackpot || r.gain !== pocket || r.level < 1 || r.elapsed >= r.duration + TIMING.step) return false;
    behind -= 1;
    paid -= pocket;
  }
  if (behind === 0) return r.from === 0 && paid === 0;
  const last = ROULETTE[r.from];
  return last !== 'stop' && RUN_TOTALS[behind - 1].has(paid - last);
}

/**
 * The ball in the three bowls: the way down that was drawn for it, which is
 * one of the ways there are, the bowl it has got to on that way, and its clock
 * there.
 *
 *   rolling         unpaid; in any bowl of its way; elapsed < that bowl's time
 *   dropped         in the last bowl of its way; paid; that bowl's time ≤ elapsed
 *
 * A hole that leads down puts the ball in the bowl below in the step it drops,
 * with its clock at nothing, so it is never seen at the end of a bowl's time
 * with further to go. How long a prize stays up depends on whether it is the
 * jackpot, which only the run knows: that is checked with the roulette.
 */
const activeBowl = shape<ActiveBowl>(
  {
    holes: list(whole(0, Math.max(...BOWLS.map((holes) => holes.length)) - 1), BOWLS.length),
    stage: whole(0, BOWLS.length - 1),
    elapsed: timer,
    duration: lasting,
    payout: whole(-1, LIMITS.purse),
  },
  (bowl) => {
    if (!FALLS.some((fall) => fall.join() === bowl.holes.join()) || bowl.stage >= bowl.holes.length || bowl.duration !== BOWL_TIMES[bowl.stage]) return false;
    return bowl.elapsed < bowl.duration ? bowl.payout === -1 : bowl.payout >= 0 && bowl.stage === bowl.holes.length - 1;
  },
);

/** What the run is told of a ball in today's bowls. */
const ballOf = (bowl: ActiveBowl): Ball => (bowl.payout < 0 ? { dropped: false } : { dropped: true, hole: fallEnd(bowl.holes), payout: bowl.payout });

/**
 * A ball's roulette: a run of turns, each as long as the last, and for a full
 * run the bowls after them. What they paid stays up for as long as that prize
 * is counted out, and no longer.
 */
const activeRoulette = shape<ActiveRoulette>({ ...run, bowl: (value) => (value === null ? null : activeBowl(value)) }, (r) => {
  if (!runAgrees(r, r.bowl && ballOf(r.bowl))) return false;
  return !r.bowl || r.bowl.payout < 0 || r.bowl.elapsed < r.bowl.duration + bowlShowTime(r.jackpot);
});

/**
 * The one bowl of the versions before the three: the hole the ball was to
 * drop into, as an index into the three ends in BOWL, and one clock for the
 * whole of it. Its time and the time its prize stayed up are written here as
 * that game had them.
 */
interface OneBowl {
  hole: number;
  elapsed: number;
  duration: number;
  payout: number;
}
const ONE_BOWL = { time: 6.5, prize: 2.2 } as const;

/**
 *   rolling         unpaid; elapsed < its time
 *   dropped         paid; its time ≤ elapsed < its time + prize
 */
const oneBowl = shape<OneBowl>({ hole: whole(0, BOWL.length - 1), elapsed: timer, duration: lasting, payout: whole(-1, LIMITS.purse) }, (bowl) => {
  if (bowl.duration !== ONE_BOWL.time) return false;
  return bowl.elapsed < bowl.duration ? bowl.payout === -1 : bowl.payout >= 0 && bowl.elapsed < bowl.duration + ONE_BOWL.prize;
});

/**
 * The ball of an older save, in today's bowls. Its end had been drawn, and it
 * comes to the same end: it is given the first way down that leads there.
 * While it was still rolling it had only been let go, so it is in the top
 * bowl, as far into its time there as it was into its time in the one bowl,
 * which was as long. Once it had dropped it had been paid, in full and as
 * that game paid it, and it lies in the last hole of its way for as long as
 * it had lain in its hole then. Nothing is paid again.
 */
function ballInOneBowl(bowl: OneBowl): ActiveBowl {
  const holes = [...(FALLS.find((fall) => fallEnd(fall) === BOWL[bowl.hole]) ?? FALLS[0])];
  if (bowl.payout < 0) return { holes, stage: 0, elapsed: bowl.elapsed, duration: BOWL_TIMES[0], payout: -1 };
  const stage = holes.length - 1;
  return { holes, stage, elapsed: BOWL_TIMES[stage] + (bowl.elapsed - bowl.duration), duration: BOWL_TIMES[stage], payout: bowl.payout };
}

/** A roulette as the versions with one bowl wrote it, held to that shape and to that game's moments, as today's. */
const rouletteWithOneBowl: Check<ActiveRoulette> = (value) => {
  const old = shape<Run & { bowl: OneBowl | null }>({ ...run, bowl: (bowl) => (bowl === null ? null : oneBowl(bowl)) }, (r) =>
    runAgrees(r, r.bowl && (r.bowl.payout < 0 ? { dropped: false } : { dropped: true, hole: BOWL[r.bowl.hole], payout: r.bowl.payout })),
  )(value);
  return old && activeRoulette({ ...old, bowl: old.bowl && ballInOneBowl(old.bowl) });
};

/**
 * What one of the screen's three places holds: the thing stored there if it
 * passes its check, and nothing otherwise. A check that throws has not passed,
 * so nothing wrong with the screen can cost the player the machine.
 */
const shown = <T>(check: Check<T>, value: unknown): T | null => {
  if (value === null || value === undefined) return null;
  try {
    return check(value) ?? null;
  } catch {
    return null;
  }
};

// ── Writing and reading ─────────────────────────────────────────────────────

/**
 * The session as text: a version number, the field, the session's numbers, and
 * what the screen is in the middle of. All of it is plain data except the
 * generator, which is left out (see `restore`).
 */
export function serialize(session: Session): string {
  const { machine, spin, bonus, roulette, ...numbers } = session;
  const { rng: _rng, ...field } = machine;
  return JSON.stringify({ version: STORAGE_VERSION, machine: field, session: numbers, screen: { spin, bonus, roulette } });
}

/**
 * The session a text was written from, or null when the text is not a save
 * that this game, or one of the five versions of it before this one, could
 * have written. It never throws.
 *
 * The generator's state is shut inside a closure and cannot be read, so it is
 * not stored: the machine that comes back draws from a new generator started
 * from `seed`. What had already been drawn — a spin's digits, a roulette's
 * pocket, what each chest holds — is plain data and comes back as it was.
 *
 * The field, the purse and the counters have to pass every check, or there is
 * no machine. The screen is treated more gently, so that a spin gone wrong does
 * not cost the player the medals: whatever it holds that is not a spin, a bonus
 * game or a roulette in one of the phases this machine passes through is simply
 * left off, and if more than one of them is on at once, which the machine never
 * does, all are. Nothing that is left off is paid or counted again.
 * A roulette that is left off gives its ball back: the ball waits again, and
 * its roulette is counted when it starts afresh, not twice. A gold spin that
 * is left off is gone with its gold, and a spin that is still held stays as
 * gold as it was.
 */
export function restore(text: string | null, seed: number): Session | null {
  try {
    if (text === null || text.length > LIMITS.length) return null;
    const save: unknown = JSON.parse(text);
    // Four parts and no others: the version, the field, the numbers and the screen.
    if (!isRecord(save) || Object.keys(save).length !== 4) return null;
    // The field changed shape at versions 2 and 3 and took jewels at version 6; the numbers changed at versions 4
    // and 6; and the ball in the bowls at version 5.
    const { version } = save;
    const withJewels = version === STORAGE_VERSION;
    const withChance = withJewels || version === VERSION_BEFORE_JEWELS || version === VERSION_WITH_ONE_BOWL;
    const read = withJewels
      ? storedMachine
      : withChance || version === VERSION_BEFORE_CHANCE
        ? fieldBeforeJewels
        : version === VERSION_WITH_ONE_AIM
          ? fieldWithOneAim
          : version === VERSION_BEFORE_ARMS
            ? fieldBeforeArms
            : null;
    const field = read?.(save.machine);
    const numbers = withJewels ? storedNumbers(save.session) : withChance ? numbersBeforeJewels(save.session) : numbersBeforeChance(save.session);
    const { screen } = save;
    if (!field || !numbers || !isRecord(screen)) return null;

    const on: OnScreen = {
      spin: shown(activeSpin(numbers.chance), screen.spin),
      bonus: shown(activeBonus(numbers), screen.bonus),
      // Every version before the three bowls had one, whatever its field was.
      roulette: shown(withJewels || version === VERSION_BEFORE_JEWELS ? activeRoulette : rouletteWithOneBowl, screen.roulette),
    };
    const busy = [on.spin, on.bonus, on.roulette].filter((thing) => thing !== null).length;
    const session: Session = { ...numbers, ...(busy > 1 ? { spin: null, bonus: null, roulette: null } : on), machine: { ...field, rng: seededRng(seed) } };
    // What is on the screen is gold only while a spin, or the game one led to, is on it. The numbers have said
    // that a medal did gild that spin; if the spin or the game itself did not come through its own check, or
    // was never there, it is gone with its gold, and nothing else on the screen is paid as if it were gold.
    if (session.spin === null && session.bonus === null) session.chance = false;
    if (screen.roulette !== null && screen.roulette !== undefined && session.roulette === null) {
      session.balls = Math.min(LIMITS.balls, session.balls + 1);
      session.roulettes = Math.max(0, session.roulettes - 1);
    }
    return session;
  } catch {
    // Not JSON, or something no check foresaw: either way, not a machine.
    return null;
  }
}
