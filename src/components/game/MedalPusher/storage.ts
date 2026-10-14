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
 *
 * Version 7 adds the payout works to the field: what the hopper's doors are
 * doing and how many pours they have begun, and the lifts that are at work on
 * a tower. A save of any version before it comes back with the doors shut,
 * having poured nothing, and with a lift at work under each tower that was
 * going up (see `asStored`); one of them that claims a door, a lift or a
 * poured medal is not a save of its version.
 *
 * Version 8 adds two numbers to the session's: how many medals have held a
 * gold spin by coming through the lit START slot or open wings, and whether
 * chance time is on. In every version before it a spin was gold only because
 * a medal had found the hold full, and chance time was whenever a gold spin
 * was held or playing: such a save is read so (see `beforeLamp`). The lamp
 * itself is read off the machine's clock and the wings follow chance time,
 * so neither is stored.
 *
 * The lifts were made slower after that, and the version did not change. A
 * hatch takes longer to open and a guard longer to sink, so a lift's two
 * clocks may now run further than they could; and a built tower stands in its
 * guard for a moment before it is let go, which a lift says with a `sunk`
 * between −1 and 0 (lift.ts). No save written before holds such a number, and
 * every number an older save does hold means what it meant: its lift is as
 * far from its first medal, or has been sinking as long, as it says.
 *
 * Version 9 adds the medals on their tongues to the session. Until then a
 * medal was counted as it came over the lip, and nothing about it was left
 * to keep. Now the machine takes it as it drops into its pocket, a ride
 * later, and the ones that have come over and not dropped yet are written
 * down with what was settled about each at the lip (`riding`). A save of any
 * version before it has none: every medal that had come over when it was
 * written had been counted there and then, and is not counted again (see
 * `beforeRide`).
 *
 * The lottery was made richer after that, when the machine was set to give
 * back what a real one does, and the version did not change: a save holds no
 * odds. Four of its numbers are held to the lottery's tables, though, and the
 * tables moved (lottery.ts): the jackpot starts at 500 and not 300, and
 * grows with every 20 medals played and not every 40; two of the board's
 * squares and the three chests hold more. So those four are read by either
 * table, the one that was (`PAID_BEFORE`) or the one that is, and every save
 * written before comes back as the machine it was:
 *
 *   the jackpot       one that stands below where a jackpot starts now
 *                     stands where it starts now, and a higher one as it
 *                     stood: nobody's jackpot is smaller for the change
 *   its progress      the medals played since it last grew. More than a
 *                     step's worth of them have grown it already by today's
 *                     step: it comes back one medal larger for each step, and
 *                     what is left over is its progress
 *   a roll's prize    a piece that had landed had been paid what its square
 *                     held then, and that is what the screen goes on showing
 *   the chests        a choice still open is of the chests that were
 *                     offered: the one picked pays what it held then
 *
 * And the jackpot's hole, once the ball has dropped, shows what the jackpot
 * then stood at, which was never less than a jackpot started at then.
 * Nothing is paid again and nothing is taken back (see `settleJackpot`).
 *
 * Version 10 has smaller medals, as small beside the field as real ones are,
 * and the tower tubes. Until then a tower stood on the pusher from the moment
 * its prize was paid and gained its medals there, on a lift in the deck; now
 * it is stacked in a tube in the back wall and pushed out whole. So the field
 * has the tubes and no lifts, a medal no longer says how many its tower has
 * yet to gain, since a tower on the field is built, and a tower can be
 * taller.
 *
 * A save of any version before it holds a field of medals of the old size,
 * packed as medals that size pack, which today's do not fit: lying where
 * they lay they would be a field full of gaps, which gives back nothing until
 * it has been fed full again. So such a save comes back on a new heap, the
 * one a machine is switched on with, and with everything on the old field
 * that was the player's to win carried over to it (see `onANewHeap`):
 *
 *   a tower, a ball or a jewel   stands or lies where it did, in the place of
 *                                the medal of the new heap nearest it
 *   a tower still going up       every medal it was to have is given to the
 *                                tubes to be stacked again, a tower of its
 *                                own, and what they have no room for is
 *                                poured; so is a tower a lift still held
 *   in the air, on the rails     as it was: each comes down where and when it
 *   and waiting to be paid       was going to
 *   the purse, the counters,     as they were, as in every save
 *   the lottery and the screen
 *
 * The plain medals of the old heap are not carried: a heap is the machine's
 * and not the player's, and the new one is as full. Each older version is
 * still held to its own shape before any of that, towers no taller than they
 * could be then.
 */

import {
  AIM,
  ARM_REACH,
  CHECKERS,
  DROP_INTERVAL,
  FIELD,
  JEWEL_DROP,
  MEDAL_RADIUS,
  PUSHER,
  RELEASE,
  ROLL_TIME,
  SETTLE,
  START_RIDE,
  TOWER,
  armStart,
  createMachine,
  pusherFront,
  seededRng,
  tipOf,
  type FallingMedal,
  type Machine,
  type Medal,
  type RollingMedal,
} from './engine';
import { POUR, shutHopper, type Hopper } from './hopper';
import { PHASE_TIME, STACK, TUBE_PHASES, armSpot, idleStacker, lastTower, stackTowers, towersIn, type Stacker, type Tube } from './stacker';
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
  type Rider,
  type Session,
} from './session';

export const STORAGE_KEY = 'medal-pusher-machine';
/**
 * What the lottery paid before it was made richer: where the jackpot started,
 * how many medals played grew it by one, what the board's squares held and
 * what the chests held. Saves written then are still read (see the head of
 * this file).
 */
export const PAID_BEFORE = { jackpotStart: 300, jackpotStep: 40, board: [10, 3, 5, 8, 3, 10, 5, 30, 3, 8, 5, 15], chests: [10, 20, 30] } as const;
/** The least a jackpot has ever stood at, and the most medals a save has ever counted towards its next one. */
const JACKPOT_FLOOR = Math.min(JACKPOT_START, PAID_BEFORE.jackpotStart);
const JACKPOT_STEPS = Math.max(JACKPOT_STEP, PAID_BEFORE.jackpotStep);
/** The tallest tower there was before the tubes, and how many places on the pusher a tower could come up in. */
const TOWERS_BEFORE = { max: 25, places: 18 } as const;
/** The version every save is written with. */
export const STORAGE_VERSION = 10;
/**
 * The version the game wrote while a tower came up through a hatch in the
 * pusher's deck on a lift, and gained its medals standing there. Its numbers
 * and its screen are today's; its field has lifts where today's has tubes.
 */
export const VERSION_BEFORE_TUBES = 9;
/**
 * The version the game wrote while a medal through a START pocket was counted
 * as it came over the lip: it had the lucky lamp and the wings, and no medal
 * was ever on its way to a pocket as far as the machine knew. Its field and
 * its screen are today's; what it lacks is the session's list of riders.
 */
export const VERSION_BEFORE_RIDE = 8;
/**
 * The version the game wrote before the lucky lamp and the wings: a spin was
 * gold only because a medal had found the hold full, and chance time was
 * whenever a gold spin was held or playing. Its field and its screen are
 * today's, payout works and all; what it lacks is two of the session's
 * numbers.
 */
export const VERSION_BEFORE_LAMP = 7;
/**
 * The version the game wrote before the payout works: every prize was thrown
 * on out of the slot, and a tower gained its medals with nothing under it.
 * Its numbers are those of the version after it, and so is its field, jewels
 * and all, but for the hopper's doors, which were never there to be open, and
 * the lifts.
 */
export const VERSION_BEFORE_WORKS = 6;
/**
 * The version the game wrote before it had jewels: three bowls and chance
 * time. Its field is that of the version after it with no jewel on it, and
 * its numbers are that version's but for the lamps and the bonuses.
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
/** The version the game wrote before it had its feed arms. A save carrying any number but these ten is refused. */
export const VERSION_BEFORE_ARMS = 1;

/**
 * The bounds a save has to keep within. Play stays far inside them. They are
 * there so that a damaged save cannot hand the machine a number it would
 * choke on, or more medals than it could ever hold.
 */
export const LIMITS = {
  /** Medals lying on the two tables. Packed two deep, as small as they are, they hold about 850. */
  medals: 1000,
  /** Medals on their way in, at a slot or on an arm's rail: as many as the two slots can feed in the time one takes to get to the tip. */
  rolling: 2 * Math.ceil(ROLL_TIME / DROP_INTERVAL),
  /** Medals in the air. Every tower the tubes take on, as tall as a tower can be, coming down at once is 384. */
  falling: 600,
  /** Lifts at work in versions 7 to 9: one under every place a tower could stand, and as many again whose guards were still sinking. */
  liftsBefore: 2 * TOWERS_BEFORE.places,
  /**
   * Medals on their way from the lip to a START pocket. A tower that goes over at a pocket sends every one of its
   * medals: nine towers as tall as a tower can be, three at each pocket, all over in one ride, would be 576, and
   * play does not come near it.
   */
  riding: 1000,
  /** How far a tower may be from where its arm has it, in field units: nothing moves it, but the sums that say so are not exact. */
  held: 1e-6,
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

/** What a medal, a ball or a tower is stored as. Every tower is built before it is on the field. */
const lying = {
  id: whole(1, LIMITS.count),
  x: across,
  y: along,
  level,
  tier: oneOf([0, 1]),
  sinceDrop: real(-1, LIMITS.clock),
  stack: whole(1, TOWER.max),
  ball: flag,
  grown: real(SETTLE.from, 1),
};

/** A medal, a ball or a tower: the only things that lay on the field before there were jewels. A ball is not a tower. */
const plainMedal = shape<Omit<Medal, 'jewel'>>(lying, (m) => !m.ball || m.stack === 1);

/**
 * A jewel is stored as a medal that says it is one. It is held to everything
 * the machine makes true of a jewel. It is neither a ball nor a tower. It
 * lies on the lower table, on the table itself: a new machine has its two
 * there and the hatch throws every other there, nothing carries one onto the
 * pusher, and nothing lies under one. And it has never come over the
 * pusher's lip, so it is not on its way down from it. Whatever is not a
 * jewel is stored without the field, exactly as it was before there were
 * jewels.
 */
const jewelMedal = shape<Required<Medal>>({ ...lying, jewel: set }, (m) => !m.ball && m.stack === 1 && m.tier === 0 && m.level === 0 && m.sinceDrop === -1);

const medal: Check<Medal> = (value) => (isRecord(value) && 'jewel' in value ? jewelMedal(value) : plainMedal(value));

/**
 * A medal as versions 1 to 9 stored it. Then a tower stood on the field from
 * the moment its prize was paid and gained its medals there, so a medal also
 * said how many its tower had yet to gain; and no tower was taller than
 * `TOWERS_BEFORE.max`.
 */
type GrowingMedal = Medal & { grow: number };

const lyingBefore = { ...lying, stack: whole(1, TOWERS_BEFORE.max), grow: whole(0, TOWERS_BEFORE.max - 1) };

const plainMedalBefore = shape<Omit<GrowingMedal, 'jewel'>>(
  lyingBefore,
  // A tower was never taller than the tallest, and a ball is not a tower.
  (m) => m.stack + m.grow <= TOWERS_BEFORE.max && (!m.ball || m.stack + m.grow === 1),
);

const jewelMedalBefore = shape<Required<GrowingMedal>>({ ...lyingBefore, jewel: set }, (m) => !m.ball && m.stack === 1 && m.grow === 0 && m.tier === 0 && m.level === 0 && m.sinceDrop === -1);

const medalBefore: Check<GrowingMedal> = (value) => (isRecord(value) && 'jewel' in value ? jewelMedalBefore(value) : plainMedalBefore(value));

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

/** The ways a medal was let go before the payout works, when nothing was poured. */
const THROWN = ['player', 'payout', 'spill'] as const;

/** What something in the air is stored as, in every version, let go in one of the ways listed, off a tower no taller than `tallest`. */
const inAir = <const S extends readonly FallingMedal['source'][]>(sources: S, tallest: number) => ({
  id: whole(1, LIMITS.count),
  x: across,
  y: along,
  level,
  fromX: across,
  fromY: along,
  rank: whole(0, tallest - 1),
  ball: flag,
  remaining: timer,
  duration: lasting,
  source: oneOf(sources),
});

const plainFalling = shape<Omit<FallingMedal, 'jewel'>>(inAir(THROWN, TOWERS_BEFORE.max), (m) => m.remaining <= m.duration);

/** With the payout works a medal may have been poured. What the hopper pours is medals, on their way to the pusher. */
const pouredToo = (tallest: number) =>
  shape<Omit<FallingMedal, 'jewel'>>(inAir(['player', 'payout', 'pour', 'spill'], tallest), (m) => m.remaining <= m.duration && (m.source !== 'pour' || (!m.ball && m.level === 1)));
const thrownOrPouredBefore = pouredToo(TOWERS_BEFORE.max);
const thrownOrPoured = pouredToo(TOWER.max);

/**
 * A jewel in the air is one the hatch has thrown, and the hatch throws one
 * way only (`dropJewel`): not a ball and not off a tower, straight out from
 * the hatch, in the time its throw takes, to come down on the lower table
 * within the patch in the middle of it that the hatch throws to. The hopper
 * pours none.
 */
const jewelFalling = shape<Required<FallingMedal>>(
  { ...inAir(THROWN, 1), jewel: set },
  (m) =>
    m.remaining <= m.duration &&
    !m.ball &&
    m.source === 'payout' &&
    m.level === 0 &&
    m.rank === 0 &&
    m.duration === JEWEL_DROP.time &&
    m.fromX === m.x &&
    m.fromY === RELEASE.depth &&
    m.x >= JEWEL_DROP.from &&
    m.x <= JEWEL_DROP.to &&
    m.y >= JEWEL_DROP.near &&
    m.y <= JEWEL_DROP.far,
);

/** Something in the air in version 6, which had jewels and no hopper; in versions 7 to 9, which had the hopper; and in today's field. */
const fallingBeforeWorks: Check<FallingMedal> = (value) => (isRecord(value) && 'jewel' in value ? jewelFalling(value) : plainFalling(value));
const fallingBeforeTubes: Check<FallingMedal> = (value) => (isRecord(value) && 'jewel' in value ? jewelFalling(value) : thrownOrPouredBefore(value));
const fallingMedal: Check<FallingMedal> = (value) => (isRecord(value) && 'jewel' in value ? jewelFalling(value) : thrownOrPoured(value));

/** The hopper's doors. Only what they are doing is checked here; that it fits what is waiting to be paid is checked with the field. */
const hopper = shape<Hopper>({
  phase: oneOf(['shut', 'opening', 'pouring', 'closing']),
  clock: real(0, Math.max(POUR.opens, POUR.closes)),
  pours: count,
  poured: whole(0, LIMITS.purse),
});

/**
 * A tube. It is in one of its phases, with no more than that phase's time
 * run, and holds what that phase holds: stacking, a tower that is not yet
 * built, or nothing at all, with no more of the next medal dropped than one
 * medal and none of it once the tower is built; letting a tower down, or
 * opening its gate, a tower that is built; and pushing a tower out, or
 * drawing back, nothing, since the tower is on the field. It has a tower on
 * its arm while it is pushing, and only then. Every tower it holds is a
 * tower, as tall as a tower can be at the most, and it holds no more of
 * them than `STACK.queue`. A tube that is stacking nothing has nothing
 * waiting either: the first tower waiting would have been begun.
 */
const tube = shape<Tube>(
  {
    phase: oneOf(TUBE_PHASES),
    clock: real(0, Math.max(1, ...Object.values(PHASE_TIME))),
    stacked: whole(0, TOWER.max),
    size: whole(0, TOWER.max),
    waiting: list(whole(1, TOWER.max), STACK.queue),
    tower: whole(0, LIMITS.count),
  },
  (t) => {
    if (t.stacked > t.size || towersIn(t) > STACK.queue) return false;
    if (t.phase === 'stacking') return t.clock < 1 && (t.stacked < t.size || t.clock === 0) && t.tower === 0 && (t.size > 0 || t.waiting.length === 0);
    if (t.clock >= PHASE_TIME[t.phase]) return false;
    if (t.phase === 'lowering' || t.phase === 'opening') return t.size > 0 && t.stacked === t.size && t.tower === 0;
    return t.size === 0 && t.stacked === 0 && (t.phase === 'pushing' ? t.tower > 0 : t.tower === 0);
  },
);

/**
 * The two tubes, how many towers their arms have begun to push out, which is
 * at least as many as are being pushed now, and which of them has a roulette
 * run's tower open to its next number. That tower is the last the tube holds,
 * one that is still to be built or waits its turn, with room on top.
 */
const stacker = shape<Stacker>(
  {
    tubes: (value) => {
      if (!Array.isArray(value) || value.length !== 2) return undefined;
      const left = tube(value[0]);
      const right = tube(value[1]);
      return left && right ? [left, right] : undefined;
    },
    made: count,
    open: oneOf([-1, 0, 1]),
  },
  (s) => {
    if (s.made < s.tubes.filter((t) => t.phase === 'pushing').length || (s.tubes[0].tower > 0 && s.tubes[0].tower === s.tubes[1].tower)) return false;
    if (s.open === -1) return true;
    const open = s.tubes[s.open];
    return (open.waiting.length > 0 || (open.phase === 'stacking' && open.size > 0)) && lastTower(open) < STACK.most;
  },
);

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

/**
 * A lift as versions 7 to 9 stored it, which brought a tower up through a
 * hatch in the pusher's deck: the tower, where its hatch was, how many medals
 * the tower would have, how long until its first medal came up, and how far
 * its guard had sunk (less than nothing while it held its tower).
 */
interface LiftBefore {
  id: number;
  x: number;
  behind: number;
  size: number;
  wait: number;
  sunk: number;
}
/** How long a lift's hatch took to open, a built tower stood in its guard, and its guard took to sink and its hatch to shut. */
const LIFT_BEFORE = { opens: 1.3, stands: 0.5, closes: 0.9 } as const;
/** Whether a lift still held its tower, and whether that tower stood built in its guard. */
const holdsBefore = (lift: LiftBefore): boolean => lift.sunk < 0;
const standsBefore = (lift: LiftBefore): boolean => lift.sunk < 0 && lift.sunk > -1;

/** The field as versions 7 to 9 stored it: towers that gained their medals on the field, on lifts. */
type MachineWithLifts = Omit<StoredMachine, 'medals' | 'stacker'> & { medals: GrowingMedal[]; growing: number; towerClock: number; lifts: LiftBefore[] };
/** The field as versions 3 to 6 stored it: no doors to pour from, and no lifts. */
type MachineBeforeWorks = Omit<MachineWithLifts, 'hopper' | 'lifts'>;
/** The field as version 2 stored it: one slot's wait and one aim for both arms. */
type MachineWithOneAim = Omit<MachineBeforeWorks, 'waits' | 'aims'> & { cooldown: number; aim: number };
/** The field as version 1 stored it: no arms, so nothing on a rail, no aim and no tips. */
type MachineBeforeArms = Omit<MachineWithOneAim, 'rolling' | 'aim' | 'tips'>;

/** A lift at work, as versions 7 to 9 stored it. That it has a tower, and where, is checked with the field. */
const liftBefore = shape<LiftBefore>(
  {
    id: whole(1, LIMITS.count),
    // Its hatch is in the pusher's deck, between the side walls where a medal can lie.
    x: real(MEDAL_RADIUS, FIELD.width - MEDAL_RADIUS),
    behind: real(0, PUSHER.max),
    size: whole(1, TOWERS_BEFORE.max),
    wait: real(0, LIFT_BEFORE.opens),
    sunk: real(-1, LIFT_BEFORE.closes),
  },
  // Its guard is on the way up, up with medals still to come, up with the tower built and standing in it, or on the
  // way down: not two of them. −1 is the only way to say the tower is not built, and a built one stands no longer
  // than `LIFT_BEFORE.stands` before it is let go.
  (l) => (l.sunk === -1 || l.sunk >= -LIFT_BEFORE.stands) && (l.sunk === -1 || l.wait === 0),
);

/**
 * How closely the medals on the rails are held to a slot's pace, in seconds.
 * A slot takes its own wait as over a billionth of a second before its end.
 */
const SLACK = 1e-6;

/** What every version of the field holds, the same in all of them. */
const always = {
  time: real(0, LIMITS.clock),
  payoutQueue: whole(0, LIMITS.purse),
  payoutClock: timer,
  nextId: whole(1, LIMITS.count),
};
/** What versions 1 to 9 held besides: the medals with their towers still to gain, and the towers' clock. Before version 6 nothing on the field or over it is a jewel, and before version 7 nothing over it was poured. */
const tablesBefore = {
  time: always.time,
  medals: list<GrowingMedal>(plainMedalBefore, LIMITS.medals),
  falling: list<FallingMedal>(plainFalling, LIMITS.falling),
  payoutQueue: always.payoutQueue,
  payoutClock: always.payoutClock,
  growing: whole(0, LIMITS.medals * TOWERS_BEFORE.max),
  towerClock: timer,
  nextId: always.nextId,
};
const rolling = list(rollingMedal, LIMITS.rolling);
/** The one wait and the one aim of the versions before each arm had its own. */
const oneSlot = { cooldown: real(0, DROP_INTERVAL) };
const oneAim = { aim: real(AIM.min, AIM.max) };

/** What has to agree in any field, whatever feeds it: every medal has an id of its own, lower than the next one to be given out. */
function tablesAgree(machine: Pick<StoredMachine, 'medals' | 'falling' | 'nextId'>, onRails: RollingMedal[]): boolean {
  const ids = new Set<number>();
  for (const { id } of [...machine.medals, ...onRails, ...machine.falling]) {
    if (id >= machine.nextId || ids.has(id)) return false;
    ids.add(id);
  }
  const balls = [...machine.medals, ...machine.falling].filter((m) => m.ball).length;
  const jewels = [...machine.medals, ...machine.falling].filter((m) => m.jewel).length;
  return balls <= LIMITS.balls && jewels <= LIMITS.jewels;
}

/** And in a field of versions 1 to 9: the medals still to be stacked are the ones the towers are waiting for. */
const tablesAgreeBefore = (machine: Pick<MachineBeforeWorks, 'medals' | 'falling' | 'growing' | 'nextId'>, onRails: RollingMedal[]): boolean =>
  tablesAgree(machine, onRails) && machine.medals.reduce((sum, m) => sum + m.grow, 0) === machine.growing;

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

/** Each arm's slot keeps its own pace: what is on one rail says nothing about the other. */
const railsKeepPace = (machine: Pick<StoredMachine, 'rolling' | 'waits'>): boolean =>
  keepsPace(
    machine.rolling.filter((m) => m.arm === 0),
    machine.waits[0],
  ) &&
  keepsPace(
    machine.rolling.filter((m) => m.arm === 1),
    machine.waits[1],
  );

/**
 * Whether the hopper's doors are in a state the hopper passes through with
 * what is waiting to be paid: shut and at rest, dropping open for a prize big
 * enough to pour with none of it gone yet, open with medals still to come, or
 * being drawn shut. A hopper that has never begun a pour is shut and has
 * poured nothing.
 */
function doorsAgree(doors: Hopper, payoutQueue: number): boolean {
  if (doors.pours === 0 && (doors.phase !== 'shut' || doors.poured !== 0)) return false;
  if (doors.phase === 'shut' && doors.clock !== 0) return false;
  if (doors.phase === 'opening' && (doors.clock > POUR.opens || doors.poured !== 0 || payoutQueue < POUR.threshold)) return false;
  if (doors.phase === 'pouring' && (doors.clock !== 0 || payoutQueue === 0)) return false;
  if (doors.phase === 'closing' && doors.clock >= POUR.closes) return false;
  return true;
}

/**
 * Whether the payout works fit the field they are in: the hopper's doors, and
 * the towers on the arms. A tube that is pushing a tower out has it on the
 * field, a tower standing on the pusher's deck where its arm has it at that
 * moment of the push, with the pusher's lip where the machine's clock has it.
 * A tower let through anywhere else would be moved by the machine's first
 * step, and the save written after that step would not pass this check.
 */
function worksAgree(machine: Pick<StoredMachine, 'time' | 'medals' | 'payoutQueue' | 'hopper' | 'stacker'>): boolean {
  if (!doorsAgree(machine.hopper, machine.payoutQueue)) return false;
  const front = pusherFront(machine.time);
  return machine.stacker.tubes.every((one, index) => {
    if (one.phase !== 'pushing') return true;
    const tower = machine.medals.find((m) => m.id === one.tower);
    if (!tower || tower.ball || tower.jewel || tower.level !== 1 || tower.tier !== 0) return false;
    const at = armSpot(index as 0 | 1, one.clock, front);
    return Math.abs(tower.x - at.x) <= LIMITS.held && Math.abs(tower.y - at.y) <= LIMITS.held;
  });
}

/**
 * Whether the payout works of versions 7 to 9 fit the field they are in. The
 * doors are as above. Every lift is on a tower of its own. One that still
 * holds its tower has it standing on the pusher where the machine leaves a
 * tower it holds, as many medals as the lift is building, and not yet begun
 * while the guard is still on its way up; and the guard is rising, or there
 * are medals still to come, or the tower is built and standing in its guard.
 * One whose guard is sinking has finished. And no tower is going up without
 * a lift under it.
 *
 * Where the machine left a tower it held was on the deck itself, since a
 * tower was put there and nothing lifted it onto other medals, and over its
 * hatch, or against the back wall where the wall had come as far forward as
 * the hatch: the wall holds its ground against everything.
 */
function worksAgreeBefore(machine: Pick<MachineWithLifts, 'time' | 'medals' | 'payoutQueue' | 'hopper' | 'lifts'>): boolean {
  const { lifts, medals } = machine;
  if (!doorsAgree(machine.hopper, machine.payoutQueue)) return false;
  const front = pusherFront(machine.time);
  const lifted = new Set<number>();
  for (const one of lifts) {
    if (lifted.has(one.id)) return false;
    lifted.add(one.id);
    const tower = medals.find((m) => m.id === one.id);
    if (!holdsBefore(one)) {
      if (one.sunk >= LIFT_BEFORE.closes || (tower && tower.grow > 0)) return false;
      continue;
    }
    if (!tower || tower.ball || tower.level !== 1 || tower.tier !== 0 || tower.stack + tower.grow !== one.size) return false;
    if (standsBefore(one) ? tower.grow !== 0 : one.wait > 0 ? tower.stack !== 1 : tower.grow === 0) return false;
    if (Math.abs(tower.x - one.x) > LIMITS.held || Math.abs(tower.y - Math.max(MEDAL_RADIUS, front - one.behind)) > LIMITS.held) return false;
  }
  return medals.every((m) => m.grow === 0 || lifted.has(m.id));
}

const storedMachine = shape<StoredMachine>(
  // In the order a machine holds them, which is the order they are written in: a machine read back and
  // written again is the same text.
  {
    time: always.time,
    medals: list(medal, LIMITS.medals),
    rolling,
    falling: list(fallingMedal, LIMITS.falling),
    payoutQueue: always.payoutQueue,
    payoutClock: always.payoutClock,
    hopper,
    stacker,
    waits,
    aims: acrossArms,
    tips: acrossArms,
    nextId: always.nextId,
  },
  (machine) => tablesAgree(machine, machine.rolling) && railsKeepPace(machine) && worksAgree(machine),
);

/** The field of versions 7 to 9, as they wrote it. */
const machineWithLifts = shape<MachineWithLifts>(
  {
    time: tablesBefore.time,
    medals: list(medalBefore, LIMITS.medals),
    rolling,
    falling: list(fallingBeforeTubes, LIMITS.falling),
    payoutQueue: tablesBefore.payoutQueue,
    payoutClock: tablesBefore.payoutClock,
    growing: tablesBefore.growing,
    towerClock: tablesBefore.towerClock,
    hopper,
    lifts: list(liftBefore, LIMITS.liftsBefore),
    waits,
    aims: acrossArms,
    tips: acrossArms,
    nextId: tablesBefore.nextId,
  },
  (machine) => tablesAgreeBefore(machine, machine.rolling) && railsKeepPace(machine) && worksAgreeBefore(machine),
);

/**
 * The heap `createMachine` throws on from the last seed an older field was
 * put on. Throwing it is by far the dearest part of reading a save, and the
 * same save is read with the same seed more than once: the copies kept on the
 * device and in the account are asked whether they read (savedMachine.ts)
 * before one of them is played. Nothing changes the heap kept here; whoever
 * reads it makes medals of their own from it.
 */
let lastHeap: { seed: number; heap: Pick<Machine, 'time' | 'medals'> } | null = null;
function newHeap(seed: number): Pick<Machine, 'time' | 'medals'> {
  if (lastHeap?.seed !== seed) lastHeap = { seed, heap: createMachine(seed) };
  return lastHeap.heap;
}

/**
 * Today's field from a field of versions 7 to 9, and so from every version
 * before the tubes, which were all of medals of the old size: on a new heap,
 * with what was the player's to win on the old field carried over to it, as
 * the heading of this file says. The heap is the one `createMachine` throws
 * on from `seed`, carried as far forward as the pusher had come at the
 * moment the save was written, so that it rests behind the lip as a new
 * machine's does; and its medals are numbered after every one the old machine
 * gave out, so that no id is given twice. No medal that was the player's is
 * lost or paid twice.
 *
 * Then a tower came up on a lift in the pusher's deck where it was to stand,
 * and stood there gaining its medals. There are no lifts now, so a tower that
 * a lift still held, still coming up or standing built in its guard, goes
 * back to be stacked: all of its medals are given to the tubes, as a tower of
 * its own, and it comes out of a window as every tower does now. Whatever the
 * tubes have no room for is poured by the hopper, as a prize too big to stack
 * is. A tower whose guard was already sinking had been let go, and it stands
 * where it stood, as a ball or a jewel lies where it lay: in the place of the
 * medal of the new heap nearest to it on its table, which is on the table
 * itself. Nothing of the new heap lies on top of it.
 */
function onANewHeap(field: MachineWithLifts, seed: number): StoredMachine | undefined {
  const heap = newHeap(seed);
  const ahead = pusherFront(field.time) - pusherFront(heap.time);
  let { nextId, payoutQueue } = field;
  const medals: Medal[] = heap.medals.map((one) => ({ ...one, id: nextId++, y: one.level === 1 ? one.y + ahead : one.y }));
  const tubes = idleStacker();
  const held = new Set(field.lifts.filter(holdsBefore).map((one) => one.id));
  const standing: Medal[] = [];
  for (const { grow, ...one } of field.medals) {
    if (grow > 0 || held.has(one.id)) {
      const size = one.stack + grow;
      payoutQueue += size - stackTowers(tubes, size);
      continue;
    }
    if (one.stack === 1 && !one.ball && !one.jewel) continue;
    let nearest: Medal | undefined;
    for (const medal of medals) {
      if (medal.level !== one.level || medal.tier !== 0 || medal.stack > 1 || medal.ball || medal.jewel) continue;
      if (!nearest || Math.hypot(medal.x - one.x, medal.y - one.y) < Math.hypot(nearest.x - one.x, nearest.y - one.y)) nearest = medal;
    }
    // A new heap has medals on both tables, so there is always one; were there none, it lies where it lay.
    const place = nearest ?? medals[medals.push({ ...one, tier: 0, id: nextId++ }) - 1];
    place.stack = one.stack;
    place.ball = one.ball;
    if (one.jewel) place.jewel = true;
    standing.push(place);
  }
  const clear = medals.filter((medal) => medal.tier === 0 || !standing.some((tall) => tall.level === medal.level && Math.hypot(tall.x - medal.x, tall.y - medal.y) < MEDAL_RADIUS * 2));
  const { time, rolling: onRails, falling, payoutClock, hopper: doors, waits: slots, aims, tips } = field;
  return storedMachine({ time, medals: clear, rolling: onRails, falling, payoutQueue, payoutClock, hopper: doors, stacker: tubes, waits: slots, aims, tips, nextId });
}

/**
 * The field of versions 7 to 9 from the parts of a field older than the
 * payout works, in the order a machine holds them. That game had no doors to
 * pour from, so they are shut: if it was saved with a prize big enough to
 * pour still waiting, they open as the machine starts. A tower it was
 * building was on the field with no lift under it; read as the next version
 * would have read it, it is on a lift whose guard is up and whose medals are
 * coming, and so it goes back to be stacked in a tube (see `onANewHeap`).
 */
const withLifts = (field: Pick<MachineBeforeWorks, keyof typeof tablesBefore>, rest: Pick<MachineBeforeWorks, 'rolling' | 'waits' | 'aims' | 'tips'>): MachineWithLifts | undefined => {
  const { time, medals, falling, payoutQueue, payoutClock, growing, towerClock, nextId } = field;
  const front = pusherFront(time);
  // A lift at work with no word of when it began: its guard is up and its medals are coming.
  const lifts = medals.filter((m) => m.grow > 0).map((m): LiftBefore => ({ id: m.id, x: m.x, behind: front - m.y, size: m.stack + m.grow, wait: 0, sunk: -1 }));
  return machineWithLifts({ time, medals, rolling: rest.rolling, falling, payoutQueue, payoutClock, growing, towerClock, hopper: shutHopper(), lifts, waits: rest.waits, aims: rest.aims, tips: rest.tips, nextId });
};

/** Where the arms are and what is on their rails, as every version since each arm had its own has stored it. */
const arms = { rolling, waits, aims: acrossArms, tips: acrossArms };

/**
 * The field of a version-6 save, as versions 7 to 9 had it. That game's field
 * was the next version's, jewels and all, but for the payout works: no doors,
 * no lifts, and nothing in the air that had been poured.
 */
const fieldBeforeWorks: Check<MachineWithLifts> = (value) => {
  const field = shape<MachineBeforeWorks>({ ...tablesBefore, medals: list(medalBefore, LIMITS.medals), falling: list(fallingBeforeWorks, LIMITS.falling), ...arms })(value);
  return field && withLifts(field, field);
};

/**
 * The field of a save of versions 3 to 5. It is the field of the version
 * after them in every part, and has no jewel on it: those games had none, and
 * a save of theirs that claims one is not a save of theirs.
 */
const fieldBeforeJewels: Check<MachineWithLifts> = (value) => {
  const field = shape<MachineBeforeWorks>({ ...tablesBefore, ...arms })(value);
  return field && withLifts(field, field);
};

// In version 2 one slot fed both rails, so the medals on the two rails together keep one slot's pace.
const machineWithOneAim = shape<MachineWithOneAim>(
  { ...tablesBefore, rolling, ...oneSlot, ...oneAim, tips: acrossArms },
  (machine) => tablesAgreeBefore(machine, machine.rolling) && keepsPace(machine.rolling, machine.cooldown),
);

/**
 * The field of a version-2 save, as versions 7 to 9 had it. That game pointed both
 * arms with one aim: each arm's tip went over it as far as the arm reached,
 * when the aim was on its side or a medal was on its rail, and to a resting
 * place otherwise. So each arm's aim is that one aim, as near as the arm can
 * point to it: an arm that was following it goes on doing so, and a medal on
 * its rail leaves from where it was going to. An arm that was at rest swings
 * over, with nothing on its rail to mind. Its one slot fed either rail, so
 * neither slot is free until that one would have been.
 */
const fieldWithOneAim: Check<MachineWithLifts> = (value) => {
  const field = machineWithOneAim(value);
  return field && withLifts(field, { rolling: field.rolling, waits: [field.cooldown, field.cooldown], aims: [tipOf(0, field.aim), tipOf(1, field.aim)], tips: field.tips });
};

const machineBeforeArms = shape<MachineBeforeArms>({ ...tablesBefore, ...oneSlot }, (machine) => tablesAgreeBefore(machine, []));

/**
 * The field of a version-1 save, as versions 7 to 9 had it. That game had no arms: a
 * medal was in the air, with its landing spot, from the moment it was dropped.
 * So whatever such a save holds in the air is already in its fall, and lands
 * where and when it was going to, whatever the arms do; nothing is on a rail;
 * and with no aim to bring back, the arms are where a new machine's are, each
 * pointing a little to its own side of the middle. Neither slot is free until
 * the one that game had would have been.
 */
const fieldBeforeArms: Check<MachineWithLifts> = (value) => {
  const field = machineBeforeArms(value);
  return field && withLifts(field, { rolling: [], waits: [field.cooldown, field.cooldown], aims: [armStart(0), armStart(1)], tips: [armStart(0), armStart(1)] });
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
  // By either table, today's or the one before it: `settleJackpot` brings them to today's.
  jackpot: whole(JACKPOT_FLOOR, LIMITS.purse),
  jackpotProgress: whole(0, JACKPOT_STEPS - 1),
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

/**
 * A jackpot and its progress as today's machine has them. One that stands
 * below where a jackpot starts now is brought up to it. And progress of a
 * step or more, which only a save from when the step was longer holds, has
 * grown the jackpot already: a medal for each step, the rest left as
 * progress. A save written by today's machine comes back as it is.
 */
export function settleJackpot<T extends Pick<StoredNumbers, 'jackpot' | 'jackpotProgress'>>(numbers: T): T {
  const grown = Math.floor(numbers.jackpotProgress / JACKPOT_STEP);
  const jackpot = Math.min(LIMITS.purse, Math.max(JACKPOT_START, numbers.jackpot) + grown);
  const jackpotProgress = numbers.jackpotProgress % JACKPOT_STEP;
  return jackpot === numbers.jackpot && jackpotProgress === numbers.jackpotProgress ? numbers : { ...numbers, jackpot, jackpotProgress };
}

/** Before the lucky lamp, only a held spin could be gold, and each gold spin was a medal that found the hold full: the ones still held,
 * and the one on the screen if the screen is on one. So a screen was never gold on a machine no medal had gilded. */
const goldAddsUp = (numbers: Pick<StoredNumbers, 'gold' | 'stock' | 'gilded' | 'wasted' | 'chance'>): boolean =>
  numbers.gold <= numbers.stock && numbers.gilded <= numbers.wasted && numbers.gold + (numbers.chance ? 1 : 0) <= numbers.gilded;

/** Chance time's three numbers as they were before the lucky lamp, which go between the purse and the counters. */
const gilding = { gold: whole(0, MAX_STOCK), gilded: count, chance: flag };

/** The jewels' two numbers, which come last. Of the jewel lamps never all are lit: the last one pays the bonus and puts them out. */
const lamps = { jewels: whole(0, JEWEL.lamps - 1), jewelBonuses: count };

/**
 * A medal on its way to a pocket: one of the three pockets, lit or not as it
 * came over, and with some of its ride still to go and never more than the
 * whole of it. One whose ride was up has dropped: the machine took it in the
 * step it was up in, and it is not written down.
 */
const rider = shape<Rider>({ gate: whole(0, CHECKERS.positions.length - 1), lit: flag, left: real(0, START_RIDE) }, (riding) => riding.left > 0);

/** The medals on their tongues, in the order they came over: every ride is as long as every other, so none has less to go than the one before it. */
const riders: Check<Rider[]> = (value) => {
  const riding = list(rider, LIMITS.riding)(value);
  return riding && riding.every((one, index) => index === 0 || one.left >= riding[index - 1].left) ? riding : undefined;
};

/** The session's numbers as they were written before a medal rode to its pocket: everything but the riders. */
type NumbersBeforeRide = Omit<StoredNumbers, 'riding'>;

// In the order a session holds them, which is the order they are written in.
const lampNumbers = { ...purse, gold: whole(0, MAX_STOCK), gilded: count, lucky: count, rush: flag, chance: flag, ...counters, ...lamps };

// Only a held spin can be gold. Each gold spin was a medal that found the hold full or one that was held
// through the lit slot or open wings: the ones still held, and the one on the screen if the screen is on
// one. So a screen is never gold on a machine no medal has made gold. A medal that found the hold full was
// wasted, and one that was held was not. And chance time is only ever on with a gold spin still to play, on
// a machine whose hold has been found full; it lasts until every gold spin has been played, so with chance
// time off every gold spin there is came through the lit slot. A medal that is still on its tongue is in
// none of these numbers.
const lampAddsUp = (numbers: NumbersBeforeRide): boolean =>
  numbers.gold <= numbers.stock &&
  numbers.gilded <= numbers.wasted &&
  numbers.lucky <= numbers.hits - numbers.wasted &&
  numbers.gold + (numbers.chance ? 1 : 0) <= numbers.gilded + numbers.lucky &&
  (numbers.rush ? numbers.gilded >= 1 && numbers.gold + (numbers.chance ? 1 : 0) >= 1 : numbers.gold + (numbers.chance ? 1 : 0) <= numbers.lucky);

const storedNumbers = shape<StoredNumbers>({ ...lampNumbers, riding: riders }, lampAddsUp);

const numbersWithoutRide = shape<NumbersBeforeRide>(lampNumbers, lampAddsUp);

/**
 * The numbers of a save written before a medal rode to its pocket, as
 * today's. That game counted a medal as it came over the lip. So every medal
 * that had come over when the save was written is in its numbers already,
 * the ones this game would still show on their tongues included, and none is
 * on its way as far as the machine is concerned: nothing is counted twice.
 */
const beforeRide = (numbers: NumbersBeforeRide): StoredNumbers => ({ ...numbers, riding: [] });

/** The numbers of a save with the lucky lamp from before the ride, as today's. */
const numbersBeforeRide: Check<StoredNumbers> = (value) => {
  const kept = numbersWithoutRide(value);
  return kept && storedNumbers(beforeRide(kept));
};

/** The session's numbers as the versions with jewels and before the lucky lamp stored them. */
type NumbersBeforeLamp = Omit<NumbersBeforeRide, 'lucky' | 'rush'>;
const numbersWithoutLamp = shape<NumbersBeforeLamp>({ ...purse, ...gilding, ...counters, ...lamps }, goldAddsUp);

/**
 * The numbers of a save written before the lucky lamp, as today's. That game
 * had no lit slot: none of its gold spins was gold from the start. And its
 * chance time was whenever a gold spin was held or playing, so it is in
 * chance time now if one is. Nor did a medal ride to its pocket.
 */
const beforeLamp = (numbers: NumbersBeforeLamp): StoredNumbers => beforeRide({ ...numbers, lucky: 0, rush: numbers.gold + (numbers.chance ? 1 : 0) > 0 });

/** The numbers of a save with jewels from before the lucky lamp, as today's. */
const numbersBeforeLamp: Check<StoredNumbers> = (value) => {
  const kept = numbersWithoutLamp(value);
  return kept && storedNumbers(beforeLamp(kept));
};

/** The session's numbers as the versions with chance time and without jewels stored them. */
type NumbersBeforeJewels = Omit<NumbersBeforeLamp, 'jewels' | 'jewelBonuses'>;
const numbersWithoutJewels = shape<NumbersBeforeJewels>({ ...purse, ...gilding, ...counters }, goldAddsUp);

/** The numbers of a save from before there were jewels, as today's: no lamp lit, and no bonus paid; and no lucky lamp either. */
const numbersBeforeJewels: Check<StoredNumbers> = (value) => {
  const kept = numbersWithoutJewels(value);
  return kept && storedNumbers(beforeLamp({ ...kept, jewels: 0, jewelBonuses: 0 }));
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
  return storedNumbers(beforeRide({ credits, inserted, won, lost, paidOut, stock, gold: 0, gilded: 0, lucky: 0, rush: false, chance: false, ...rest, jewels: 0, jewelBonuses: 0 }));
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
 * A gold spin's roll pays `pays` times what the square holds: what it holds
 * now, or what it held when the save was written (`PAID_BEFORE`).
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
      const paid = b.payout === BOARD[reached] * pays || b.payout === PAID_BEFORE.board[reached] * pays;
      return b.elapsed >= b.duration ? paid && square === reached : b.payout === -1 && square === b.from;
    },
  );

const inOrder = (medals: readonly number[]): string => [...medals].sort((a, b) => a - b).join();

/**
 * A choice of chests, which hold the three prizes in some order: today's, or
 * the three they held when the save was written (`PAID_BEFORE`). `quickPick`
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
      if (inOrder(c.prizes) !== inOrder(CHESTS) && inOrder(c.prizes) !== inOrder(PAID_BEFORE.chests)) return false;
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
 * than a jackpot has ever started at.
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
      const held = ball.hole === 'jackpot' ? ball.payout >= JACKPOT_FLOOR : ball.payout === holePays(ball.hole, JACKPOT_START);
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
 * that this game, or one of the nine versions of it before this one, could
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
    // The field changed shape at versions 2 and 3, took jewels at version 6, the payout works at version 7 and the
    // tubes and today's medals at version 10; the numbers changed at versions 4, 6, 8 and 9; and the ball in the bowls
    // at version 5. Every field before version 10 is read as versions 7 to 9 wrote theirs, and comes back on a new heap.
    const { version } = save;
    const withTubes = version === STORAGE_VERSION;
    const withRide = withTubes || version === VERSION_BEFORE_TUBES;
    const withLamp = withRide || version === VERSION_BEFORE_RIDE;
    const withWorks = withLamp || version === VERSION_BEFORE_LAMP;
    const withJewels = withWorks || version === VERSION_BEFORE_WORKS;
    const withChance = withJewels || version === VERSION_BEFORE_JEWELS || version === VERSION_WITH_ONE_BOWL;
    const readBefore = withWorks
      ? machineWithLifts
      : withJewels
        ? fieldBeforeWorks
        : withChance || version === VERSION_BEFORE_CHANCE
          ? fieldBeforeJewels
          : version === VERSION_WITH_ONE_AIM
            ? fieldWithOneAim
            : version === VERSION_BEFORE_ARMS
              ? fieldBeforeArms
              : null;
    const before = withTubes ? undefined : readBefore?.(save.machine);
    const counted = withRide
      ? storedNumbers(save.session)
      : withLamp
        ? numbersBeforeRide(save.session)
        : withJewels
          ? numbersBeforeLamp(save.session)
          : withChance
            ? numbersBeforeJewels(save.session)
            : numbersBeforeChance(save.session);
    const { screen } = save;
    if (!counted || !isRecord(screen)) return null;
    // An older field is put on a new heap only once everything else has been read, since that is the dearest part.
    const field = withTubes ? storedMachine(save.machine) : before && onANewHeap(before, seed);
    if (!field) return null;
    // The jackpot as today's machine keeps it, whichever table the save was written by.
    const numbers = settleJackpot(counted);

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
    // And chance time is over with its last gold spin.
    if (session.gold === 0 && !session.chance) session.rush = false;
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
