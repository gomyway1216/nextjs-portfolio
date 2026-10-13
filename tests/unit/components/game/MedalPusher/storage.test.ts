import { describe, expect, it } from 'vitest';

import { fedSpot, legOf, rollingSpot } from '@/components/game/MedalPusher/arms';
import {
  AIM,
  ARM_REACH,
  ARM_SPEED,
  CHECKERS,
  DROP_INTERVAL,
  FALL_TIME,
  FEED,
  FIELD,
  JEWEL_DROP,
  MEDAL_RADIUS,
  PUSHER,
  RELEASE,
  ROLL_TIME,
  SETTLE,
  TOWER,
  armGoal,
  armStart,
  ballsOnField,
  buildTowers,
  dropJewel,
  jewelsOnField,
  medalsOnField,
  pusherFront,
  queuePayout,
  seededRng,
  tipOf,
  type Medal,
} from '@/components/game/MedalPusher/engine';
import { POUR, shutHopper } from '@/components/game/MedalPusher/hopper';
import { LIFT, holds, liftAtWork, type Lift } from '@/components/game/MedalPusher/lift';
import { chuckerSpots } from '@/components/game/MedalPusher/chuckers';
import {
  BOARD,
  BOWL,
  BOWLS,
  CHAIN_GOAL,
  CHANCE,
  CHESTS,
  FALLS,
  JACKPOT_START,
  JACKPOT_STEP,
  JEWEL,
  REACH_KINDS,
  ROULETTE,
  fallEnd,
  pouredOf,
  squareAfter,
  type SpinResult,
} from '@/components/game/MedalPusher/lottery';
import {
  BOWL_TIMES,
  MAX_STOCK,
  START_CREDITS,
  START_JEWELS,
  TIMING,
  advance,
  bowlShowTime,
  chanceLeft,
  createSession,
  insert,
  pickChest,
  reachTime,
  refill,
  sugorokuDuration,
  type Session,
  type SessionEvent,
} from '@/components/game/MedalPusher/session';
import {
  LIMITS,
  STORAGE_KEY,
  STORAGE_VERSION,
  VERSION_BEFORE_ARMS,
  VERSION_BEFORE_CHANCE,
  VERSION_BEFORE_JEWELS,
  VERSION_BEFORE_LAMP,
  VERSION_BEFORE_WORKS,
  VERSION_WITH_ONE_AIM,
  VERSION_WITH_ONE_BOWL,
  restore,
  serialize,
} from '@/components/game/MedalPusher/storage';

import beforeArms from './fixtures/save-before-feed-arms.json';
import beforeChanceTime from './fixtures/save-before-chance-time.json';
import beforeSlots from './fixtures/save-before-the-front-slots.json';
import beforeWorks from './fixtures/save-before-the-payout-works.json';
import jewelsBeforeWorks from './fixtures/save-with-jewels-before-the-payout-works.json';
import beforeLeftAndRight from './fixtures/save-before-left-and-right.json';
import beforeLipChuckers from './fixtures/save-before-lip-chuckers.json';
import beforeLamp from './fixtures/save-before-the-lucky-lamp.json';
import dayBeforeLamp from './fixtures/save-before-the-lucky-lamp-with-the-payout-works.json';
import beforeJewels from './fixtures/save-before-jewels.json';
import threeBowlsBeforeJewels from './fixtures/save-with-the-three-bowls-before-jewels.json';
import beforeThreeBowls from './fixtures/save-before-the-three-bowls.json';
import withChanceAndOneBowl from './fixtures/save-with-chance-time-and-one-bowl.json';

import { aimBoth, insertAt } from './feeding';

const DT = 1 / 60;
/** Tests that run the machine for a good while get room on a slow machine. */
const LONG = 30_000;

/** A machine that has been played: three medals a second across the field, the purse refilled when it is empty. */
function played(seed: number, seconds = 40): Session {
  const session = createSession(seed);
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (session.credits === 0) refill(session);
    if (i % 20 === 0) insertAt(session, 12 + ((i * 37) % 76));
    advance(session, DT);
  }
  return session;
}

/** Everything about a session but its generator, which is the one thing a save does not hold. */
const plain = (session: Session) => ({ ...session, machine: { ...session.machine, rng: null } });

/** The session written down and read back. */
function reread(session: Session, seed = 1): Session {
  const back = restore(serialize(session), seed);
  if (!back) throw new Error('the save was refused');
  return back;
}

/** Makes the machine's next draws come out as scripted, then fall back to a fixed value. */
function script(session: Session, values: number[], then = 0.5): void {
  const queue = [...values];
  session.machine.rng = () => queue.shift() ?? then;
}

/** A session with no balls lying about and no spins held, so that nothing comes onto its screen unasked. */
const quiet = (): Session => createSession(5, { balls: 0 });

/**
 * How wide a START pocket was in the games that wrote the old saves below, before the pockets were narrowed and
 * given wings: what the engine's `CHECKERS.halfWidth` was then.
 */
const POCKET_THEN = 1.7;
/**
 * Plays `play` with the wings opening `width` wide, and puts today's width back. Today's open wings take a medal
 * from less far to the side than the pockets of those games did, so a machine in chance time counts fewer of the
 * medals that come over beside a slot than they did. Where a test says an old save plays on exactly as the game
 * that wrote it did, that is the one difference it sets aside, and this is how.
 */
function withWings<T>(width: number, play: () => T): T {
  const checkers = CHECKERS as { wingWidth: number };
  const today = checkers.wingWidth;
  checkers.wingWidth = width;
  try {
    return play();
  } finally {
    checkers.wingWidth = today;
  }
}
/** Whether `part` is some of `whole`, in the order `whole` has them. */
function someOf<T>(part: readonly T[], whole: readonly T[]): boolean {
  let found = 0;
  for (const one of whole) if (found < part.length && one === part[found]) found += 1;
  return found === part.length;
}

/** The roll that stops the roulette on a given pocket, and the one that sends the ball down a given way through the bowls. */
const pocketRoll = (pocket: number): number => (pocket + 0.5) / ROULETTE.length;
const fallRoll = (fall: number): number => (fall + 0.5) / FALLS.length;
/** The pockets of a full run: as many numbers as it takes to send the ball into the bowls. */
const FULL_RUN = [1, 2, 3, 5, 6, 7].slice(0, CHAIN_GOAL);
/** A way down to each end there is: through all three bowls to the jackpot, into the middle bowl's own hole, and into the top bowl's. */
const TO_JACKPOT = FALLS.findIndex((fall) => fallEnd(fall) === 'jackpot');
const TO_MIDDLE = FALLS.findIndex((fall) => fall.length === 2);
const TO_TOP = FALLS.findIndex((fall) => fall.length === 1);
/** What the middle bowl's own hole holds, and the top bowl's. */
const MIDDLE_PRIZE = fallEnd(FALLS[TO_MIDDLE]) as number;
const TOP_PRIZE = fallEnd(FALLS[TO_TOP]) as number;
/** The seconds from a ball going over to its screen being free again, when its run is full and it goes down this way. */
const fullRunTime = (fall: number): number =>
  CHAIN_GOAL * (TIMING.roulette + TIMING.step) + FALLS[fall].reduce<number>((sum, _hole, bowl) => sum + BOWL_TIMES[bowl], 0) + bowlShowTime(fallEnd(FALLS[fall]) === 'jackpot');

const everyPosition = (session: Session): number[] => [
  ...session.machine.aims,
  ...session.machine.waits,
  ...session.machine.tips,
  ...session.machine.medals.flatMap((medal) => [medal.x, medal.y, medal.grown, medal.sinceDrop]),
  ...session.machine.rolling.map((medal) => medal.remaining),
  ...session.machine.falling.flatMap((medal) => [medal.x, medal.y, medal.fromX, medal.fromY, medal.remaining]),
];

describe('a save', () => {
  it('brings a played machine back with the same plain data', { timeout: LONG }, () => {
    const session = played(11);
    expect(session.inserted).toBeGreaterThan(100);
    expect(session.won).toBeGreaterThan(0);
    const back = reread(session, 3);
    expect(plain(back)).toEqual(plain(session));
    expect(serialize(back)).toBe(serialize(session));
    // The generator is a new one: it draws, and it is not the old one.
    expect(back.machine.rng).not.toBe(session.machine.rng);
    const draw = back.machine.rng();
    expect(draw).toBeGreaterThanOrEqual(0);
    expect(draw).toBeLessThan(1);
  });

  it('is a version, the field, the numbers and the screen, without the generator', () => {
    const session = createSession(2);
    const save = JSON.parse(serialize(session));
    expect(Object.keys(save).sort()).toEqual(['machine', 'screen', 'session', 'version']);
    expect(save.version).toBe(STORAGE_VERSION);
    expect(save.machine).not.toHaveProperty('rng');
    expect(save.machine.medals).toHaveLength(session.machine.medals.length);
    expect(save.session.credits).toBe(START_CREDITS);
    expect(save.session.jackpot).toBe(JACKPOT_START);
    expect(save.screen).toEqual({ spin: null, bonus: null, roulette: null });
    expect(STORAGE_KEY).toMatch(/^medal-pusher/);
  });

  it('stays well under 100 KB for a machine in play', { timeout: LONG }, () => {
    // Every character of a save is ASCII, so its length is its size in bytes.
    const fresh = serialize(createSession(4));
    const inPlay = serialize(played(4));
    expect(fresh).toMatch(/^[\x20-\x7e]*$/);
    expect(fresh.length).toBeGreaterThan(10_000);
    expect(fresh.length).toBeLessThan(100_000);
    expect(inPlay.length).toBeLessThan(100_000);
  });

  it('carries on exactly as the machine it was written from would have, given the same draws', { timeout: LONG }, () => {
    const session = played(21, 20);
    session.machine.rng = seededRng(77);
    const back = reread(session, 77);
    for (let i = 0; i < 600; i++) {
      for (const machine of [session, back]) {
        if (machine.credits === 0) refill(machine);
        if (i % 15 === 0) insertAt(machine, 20 + ((i * 13) % 60));
        advance(machine, DT);
      }
    }
    expect(session.machine.time).toBeGreaterThan(29);
    expect(plain(back)).toEqual(plain(session));
  });

  it('carries on with a generator of its own, and its books still balance', { timeout: LONG }, () => {
    const session = played(8, 20);
    const medals = medalsOnField(session.machine);
    const back = reread(session, 123456);
    expect(medalsOnField(back.machine)).toBe(medals);
    expect(ballsOnField(back.machine)).toBe(ballsOnField(session.machine));
    back.stock = MAX_STOCK;
    for (let i = 0; i < 900; i++) {
      if (back.credits === 0) refill(back);
      if (i % 12 === 0) insertAt(back, 15 + ((i * 29) % 70));
      advance(back, DT);
    }
    expect(back.spins).toBeGreaterThan(session.spins);
    expect(back.credits).toBe(START_CREDITS * (1 + back.refills) - back.inserted + back.won);
    expect(everyPosition(back).every(Number.isFinite)).toBe(true);
    // And it can be written down and read back again.
    expect(plain(reread(back))).toEqual(plain(back));
  });

  it('brings a medal back on its rail, to drop where the arms point when it gets to the tip', () => {
    const session = createSession(6, { balls: 0 });
    insertAt(session, 30);
    for (let i = 0; i < 10; i++) advance(session, DT);
    // On the rail a medal has an arm and a time, and no landing spot: the save holds none for it.
    const stored = JSON.parse(serialize(session)).machine;
    expect(stored.aims).toEqual([30, armStart(1)]);
    // Its arm has swung over its aim, and the other is where it was pointed: the save holds where each tip is.
    expect(stored.tips).toEqual([30, armStart(1)]);
    // And how long each arm's slot still has to wait: the one that was fed, ten steps into its wait.
    expect(stored.waits[0]).toBeCloseTo(DROP_INTERVAL - 10 * DT, 9);
    expect(stored.waits[1]).toBe(0);
    expect(stored.rolling).toHaveLength(1);
    expect(Object.keys(stored.rolling[0]).sort()).toEqual(['arm', 'id', 'remaining']);
    expect(stored.falling).toEqual([]);
    const back = reread(session, 9);
    expect(back.machine.aims).toEqual([30, armStart(1)]);
    expect(back.machine.aims).not.toBe(session.machine.aims);
    expect(back.machine.waits).toEqual(session.machine.waits);
    expect(back.machine.tips).toEqual(session.machine.tips);
    expect(back.machine.tips).not.toBe(session.machine.tips);
    expect(back.machine.rolling).toEqual(session.machine.rolling);
    expect(back.machine.rolling[0]).toMatchObject({ arm: 0 });
    expect(back.machine.rolling[0].remaining).toBeCloseTo(ROLL_TIME - 10 * DT, 9);
    expect(medalsOnField(back.machine)).toBe(medalsOnField(session.machine));
    // The arms are swung away on both, and both let the medal go over the new aim, at the same moment.
    for (const machine of [session, back]) {
      machine.machine.rng = seededRng(4);
      aimBoth(machine.machine, 44);
      for (let i = 0; i < Math.round(ROLL_TIME / DT) - 5; i++) advance(machine, DT);
      expect(machine.machine.rolling).toEqual([]);
      expect(machine.machine.falling).toHaveLength(1);
      expect(machine.machine.falling[0].fromX).toBe(44);
    }
    expect(back.machine.falling).toEqual(session.machine.falling);
    for (const machine of [session, back]) for (let i = 0; i < 60; i++) advance(machine, DT);
    expect(serialize(back)).toBe(serialize(session));
  });

  it('has its pusher, and the chuckers on its lip, where they were, and keeps them in step', { timeout: LONG }, () => {
    const session = played(12, 7.3);
    const back = reread(session);
    // The pusher moves with the machine's own clock, which the save holds, and the chuckers ride on its lip:
    // there is nothing else to restore.
    expect(back.machine.time).toBe(session.machine.time);
    expect(pusherFront(back.machine.time)).toBeGreaterThan(PUSHER.min);
    expect(pusherFront(back.machine.time)).toBe(pusherFront(session.machine.time));
    expect(chuckerSpots(back.machine.time)).toEqual(chuckerSpots(session.machine.time));
    for (const machine of [session, back]) for (let i = 0; i < 113; i++) advance(machine, DT);
    expect(back.machine.time).toBe(session.machine.time);
    expect(chuckerSpots(back.machine.time)).toEqual(chuckerSpots(session.machine.time));
    expect(chuckerSpots(back.machine.time)).not.toEqual(chuckerSpots(back.machine.time - 113 * DT));
    expect(pusherFront(back.machine.time)).toBe(pusherFront(session.machine.time));
    expect(back.hits).toBe(session.hits);
  });

  it('holds a machine in the middle of a jackpot, however full the field gets', { timeout: LONG }, () => {
    const session = played(5, 10);
    buildTowers(session.machine, TOWER.max * 18);
    queuePayout(session.machine, 300);
    let most = 0;
    for (let i = 0; i < 60 * 40; i++) {
      if (session.credits === 0) refill(session);
      insertAt(session, 10 + ((i * 7) % 80));
      advance(session, DT);
      if (i % 60 === 0) {
        const text = serialize(session);
        most = Math.max(most, text.length);
        expect(restore(text, 1)).not.toBeNull();
      }
    }
    expect(session.machine.medals.length).toBeLessThan(LIMITS.medals);
    expect(most).toBeLessThan(LIMITS.length / 2);
  });
});

describe('what the screen is in the middle of', () => {
  /** Runs a session, writing it down and reading it back ten times a second, and notes what was on the screen each time. */
  function follow(session: Session, seconds: number, seen: Set<string>, each?: (step: number) => void): void {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      each?.(i);
      advance(session, DT);
      if (i % 6 !== 0) continue;
      const { spin, bonus, roulette } = session;
      if (spin) seen.add(spin.done ? 'spin done' : spin.result.reachKind === 'long' ? 'long reach' : 'spin');
      if (bonus?.kind === 'sugoroku') seen.add(bonus.payout < 0 ? 'sugoroku' : 'sugoroku paid');
      if (bonus?.kind === 'chest') seen.add(bonus.payout >= 0 ? 'chest paid' : bonus.picked >= 0 ? 'chest picked' : 'chest');
      if (roulette?.bowl) seen.add(roulette.bowl.payout < 0 ? `ball in bowl ${roulette.bowl.stage + 1}` : roulette.jackpot ? 'jackpot' : 'ball in a hole');
      else if (roulette) seen.add(roulette.over ? 'roulette over' : roulette.landed ? 'roulette landed' : 'roulette');
      const back = reread(session);
      expect(serialize(back)).toBe(serialize(session));
      expect(back.spin).toEqual(session.spin);
      expect(back.bonus).toEqual(session.bonus);
      expect(back.roulette).toEqual(session.roulette);
    }
  }

  it('comes back at every moment of a spin, a bonus game, a roulette and the bowls', { timeout: LONG }, () => {
    const seen = new Set<string>();

    // Two spins that miss: every draw is one no line comes of.
    let session = quiet();
    session.stock = 2;
    script(session, [0.99]);
    follow(session, 7, seen);
    expect(session.tiers.miss).toBe(2);

    // 2·2·2 with the usual reach, and a roll on the board.
    session = quiet();
    session.stock = 1;
    script(session, [0.03, 0, 0.9]);
    follow(session, 9, seen);
    expect(session.tiers.small).toBe(1);
    expect(session.square).toBeGreaterThan(0);

    // 1·1·1 with the long reach and the chests, once left to the clock and once picked by the player.
    for (const pick of [false, true]) {
      session = quiet();
      session.stock = 1;
      script(session, [0.01, 0, 0.1]);
      follow(session, 19, seen, () => {
        if (pick && session.bonus?.kind === 'chest' && session.bonus.elapsed > 1) pickChest(session, 1);
      });
      expect(session.tiers.big).toBe(1);
      expect(session.paidOut).toBeGreaterThan(0);
    }

    // A ball's roulette: two numbers and a cross.
    session = quiet();
    session.balls = 1;
    script(session, [pocketRoll(1), pocketRoll(2), pocketRoll(0)]);
    follow(session, 16, seen);
    expect(session.roulettes).toBe(1);
    expect(session.jackpots).toBe(0);

    // A full run, and the ball down all three bowls into the jackpot's hole.
    session = quiet();
    session.balls = 1;
    script(session, [...FULL_RUN.map(pocketRoll), fallRoll(TO_JACKPOT)]);
    follow(session, fullRunTime(TO_JACKPOT) + 1, seen);
    expect(session.jackpots).toBe(1);
    expect(session.roulette).toBeNull();

    // The same run, and the ball into a hole that holds medals: the middle bowl's.
    session = quiet();
    session.balls = 1;
    script(session, [...FULL_RUN.map(pocketRoll), fallRoll(TO_MIDDLE)]);
    follow(session, fullRunTime(TO_MIDDLE) + 1, seen);
    expect(session.jackpots).toBe(0);
    expect(session.roulette).toBeNull();
    expect(session.paidOut).toBe(FULL_RUN.reduce((sum, pocket) => sum + (ROULETTE[pocket] as number), 0) + MIDDLE_PRIZE);

    const everything = ['spin', 'long reach', 'spin done', 'sugoroku', 'sugoroku paid', 'chest', 'chest picked', 'chest paid'];
    const bowls = BOWLS.map((_, bowl) => `ball in bowl ${bowl + 1}`);
    expect([...seen].sort()).toEqual([...everything, 'roulette', 'roulette landed', 'roulette over', ...bowls, 'jackpot', 'ball in a hole'].sort());
  });
});

// ── Saves that are not what they should be ──────────────────────────────────

type Row = Record<string, unknown>;
/** A save as it is stored, typed loosely enough for a test to damage it. */
interface Save {
  version: unknown;
  machine: Row & { medals: Row[]; rolling: Row[]; falling: Row[] };
  session: Row & { tiers: Row };
  screen: Row;
}

/**
 * A field as version 2 wrote it, in today's shape: the one slot's wait for both slots, and the one aim as near as
 * each arm points to it. Everything else is as it was, in the order a machine holds it.
 */
const asToday = (machine: Row): Row => {
  const { cooldown, aim, tips, nextId, ...tables } = machine;
  return withWorks({ ...tables, waits: [cooldown, cooldown], aims: [tipOf(0, aim as number), tipOf(1, aim as number)], tips, nextId });
};
/** The numbers of a save from before there were jewels, as today's game holds them: no lamp lit, and no bonus paid. */
const withJewels = (session: Row): Row => ({ ...session, jewels: 0, jewelBonuses: 0 });
/**
 * A field as the versions before the payout works wrote it, in today's shape: the hopper's doors shut, and a lift
 * at work, its guard up, under every tower that was going up. Everything else is as it was, in the order a
 * machine holds it.
 */
function withWorks(machine: Row): Row {
  const { waits, aims, tips, nextId, ...tables } = machine;
  const front = pusherFront(tables.time as number);
  const lifts = (tables.medals as Medal[]).filter((medal) => medal.grow > 0).map((medal) => liftAtWork(medal, front));
  return { ...tables, hopper: shutHopper(), lifts, waits, aims, tips, nextId };
}
/**
 * A session's numbers as the versions before chance time wrote them, in today's shape: none of the held spins gold,
 * none ever turned gold or held gold through a lit slot, no chance time on, nothing gold on the screen, and no
 * jewel lamp lit. Everything else is as it was, in the order a session holds it.
 */
const numbersToday = (session: Row): Row => {
  const { credits, inserted, won, lost, paidOut, stock, ...rest } = session;
  return withJewels({ credits, inserted, won, lost, paidOut, stock, gold: 0, gilded: 0, lucky: 0, rush: false, chance: false, ...rest });
};
/**
 * A session's numbers as the versions with chance time and no lucky lamp wrote them, versions 4 to 7, in today's
 * shape: none of its gold spins was gold from the start, and it is in chance time if a gold spin is held or playing,
 * which is what chance time was then. One from before there were jewels, versions 4 and 5, has no jewel lamp lit.
 * Everything else is as it was, in the order a session holds it.
 */
const numbersWithLamp = (session: Row): Row => {
  const { credits, inserted, won, lost, paidOut, stock, gold, gilded, ...rest } = 'jewels' in session ? session : withJewels(session);
  return { credits, inserted, won, lost, paidOut, stock, gold, gilded, lucky: 0, rush: (gold as number) + (rest.chance === true ? 1 : 0) > 0, ...rest };
};
/** The two numbers the lucky lamp added to a session's, which no save before it holds. */
const LAMP_NUMBERS = ['lucky', 'rush'];
/** A save of today's less those two numbers: what the version before the lamp wrote of the same machine, but for its number. */
const withoutLamp = (save: Save): Save => {
  const { lucky: _lucky, rush: _rush, ...session } = save.session;
  return { ...save, session: session as Save['session'] };
};
/** A whole save of version 2 or 3 as today's game writes the same machine. */
const writtenToday = (text: string): string => {
  const save = JSON.parse(text) as Save;
  return JSON.stringify({ ...save, version: STORAGE_VERSION, machine: save.version === VERSION_WITH_ONE_AIM ? asToday(save.machine) : withWorks(save.machine), session: numbersToday(save.session) });
};

/**
 * A good save with one of everything: medals in both tiers of both tables,
 * two balls, three towers still going up, a medal in the air and another on
 * its way down an arm.
 */
const GOOD = (() => {
  const session = createSession(3);
  // The first medal has rolled down its arm and dropped off the tip.
  insertAt(session, 50);
  advance(session, ROLL_TIME + DT);
  buildTowers(session.machine, 60);
  insertAt(session, 50);
  for (let i = 0; i < 4; i++) advance(session, DT);
  session.roulettes = 3;
  return serialize(session);
})();

const good = (): Save => JSON.parse(GOOD);
const damaged = (damage: (save: Save) => void): string => {
  const save = good();
  damage(save);
  return JSON.stringify(save);
};
const find = (rows: Row[], test: (row: Row) => boolean): Row => {
  const row = rows.find(test);
  if (!row) throw new Error('the good save has no such medal');
  return row;
};
const tower = (save: Save): Row => find(save.machine.medals, (medal) => (medal.grow as number) > 0);
/** The lifts of a save, and the one under a tower. */
const liftsOf = (save: Save): Row[] => save.machine.lifts as Row[];
const liftUnder = (save: Save, medal: Row): Row => find(liftsOf(save), (lift) => lift.id === medal.id);
const ball = (save: Save): Row => find(save.machine.medals, (medal) => medal.ball === true);
const loose = (save: Save): Row => find(save.machine.medals, (medal) => medal.ball === false && medal.stack === 1 && medal.grow === 0 && medal.jewel !== true);
const jewel = (save: Save): Row => find(save.machine.medals, (medal) => medal.jewel === true);
/** Makes the medal in the air a jewel the hatch has let go. */
const jewelInAir = (save: Save): Row =>
  Object.assign(inAir(save), {
    x: (JEWEL_DROP.from + JEWEL_DROP.to) / 2,
    y: (JEWEL_DROP.near + JEWEL_DROP.far) / 2,
    level: 0,
    fromX: (JEWEL_DROP.from + JEWEL_DROP.to) / 2,
    fromY: RELEASE.depth,
    rank: 0,
    ball: false,
    remaining: JEWEL_DROP.time / 2,
    duration: JEWEL_DROP.time,
    source: 'payout',
    jewel: true,
  });
/** Marks `count` more of the loose medals on the tables as jewels. */
const moreJewels = (save: Save, count: number): void => {
  // Only where a jewel can be: on the lower table, on the table itself, and not on its way down from the pusher's lip.
  const plainOnes = save.machine.medals.filter(
    (medal) => medal.ball === false && medal.stack === 1 && medal.grow === 0 && medal.tier === 0 && medal.level === 0 && medal.sinceDrop === -1 && medal.jewel !== true,
  );
  if (plainOnes.length < count) throw new Error('the good save has too few medals for that');
  for (const medal of plainOnes.slice(0, count)) medal.jewel = true;
};
const inAir = (save: Save): Row => save.machine.falling[0];
const onRail = (save: Save): Row => save.machine.rolling[0];
/** Puts a second medal on the rails: `ahead` seconds further down than the one that is there, or behind it when that is negative. */
const another = (save: Save, ahead: number): void => {
  const nextId = save.machine.nextId as number;
  const medal = { id: nextId, arm: 1, remaining: (onRail(save).remaining as number) - ahead };
  if (ahead > 0) save.machine.rolling.unshift(medal);
  else save.machine.rolling.push(medal);
  save.machine.nextId = nextId + 1;
};

describe('the good save the damaged ones are made from', () => {
  it('reads, and holds one of everything', () => {
    const save = good();
    expect(restore(GOOD, 1)).not.toBeNull();
    expect(save.machine.medals.filter((medal) => (medal.grow as number) > 0)).toHaveLength(3);
    expect(save.machine.medals.filter((medal) => medal.ball)).toHaveLength(2);
    // Two jewels, and they are the only things on the field that say whether they are one.
    expect(save.machine.medals.filter((medal) => medal.jewel === true)).toHaveLength(START_JEWELS);
    expect(save.machine.medals.filter((medal) => 'jewel' in medal)).toHaveLength(START_JEWELS);
    expect([save.session.jewels, save.session.jewelBonuses]).toEqual([0, 0]);
    expect(save.machine.medals.some((medal) => medal.tier === 1 && medal.level === 0)).toBe(true);
    expect(save.machine.medals.some((medal) => medal.tier === 1 && medal.level === 1)).toBe(true);
    expect(save.machine.falling).toHaveLength(1);
    expect(inAir(save).remaining).toBeGreaterThan(0.2);
    // The medal on the rail went in four steps ago, and the slot is still waiting from it.
    expect(save.machine.rolling).toHaveLength(1);
    expect(onRail(save).remaining).toBeCloseTo(ROLL_TIME - 4 * DT, 9);
    expect(save.machine.waits).toEqual([0, expect.closeTo(DROP_INTERVAL - 4 * DT, 9)]);
    // It went into the right arm, which was pointed at the middle for it: its tip is over the middle, and the
    // left arm, which nobody has pointed, is where a new machine has it.
    expect(onRail(save).arm).toBe(1);
    expect(save.machine.aims).toEqual([armStart(0), 50]);
    expect(save.machine.tips).toEqual([armStart(0), 50]);
    expect(save.machine.growing).toBeGreaterThan(0);
    // Damage that changes nothing is no damage.
    expect(restore(damaged(() => {}), 1)).not.toBeNull();
  });
});

describe('a text that is not a save', () => {
  const texts: [string, string][] = [
    ['nothing at all', ''],
    ['a word', 'medals'],
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"a save"'],
    ['a list', '[]'],
    ['an empty object', '{}'],
    ['half a save', GOOD.slice(0, GOOD.length / 2)],
    ['a save with something after it', `${GOOD}}`],
    ['a save inside a list', `[${GOOD}]`],
    ['a number too big to be a number', GOOD.replace(/"credits":\d+/, '"credits":1e999')],
    ['a negative number too big to be a number', GOOD.replace(/"time":[^,]+/, '"time":-1e999')],
    ['a text longer than any machine', `${GOOD}${' '.repeat(LIMITS.length)}`],
  ];

  it.each(texts)('refuses %s', (_name, text) => {
    expect(text).not.toBe(GOOD);
    expect(restore(text, 1)).toBeNull();
  });

  it('refuses no text, and anything that is not text, without throwing', () => {
    expect(restore(null, 1)).toBeNull();
    for (const value of [undefined, 42, true, {}, [], () => GOOD, Symbol('save'), JSON.parse(GOOD)]) {
      expect(restore(value as unknown as string, 1)).toBeNull();
    }
  });

  it('refuses a seed no generator can start from, without throwing', () => {
    expect(restore(GOOD, Number.NaN)).toBeNull();
    expect(restore(GOOD, Number.POSITIVE_INFINITY)).toBeNull();
    expect(restore(GOOD, -7.5)).not.toBeNull();
  });
});

describe('a save that has been damaged', () => {
  const cases: [string, (save: Save) => void][] = [
    // The save as a whole
    ['the version before the feed arms, on a machine that has them', (save) => (save.version = VERSION_BEFORE_ARMS)],
    ['a version before any', (save) => (save.version = 0)],
    ['a newer version', (save) => (save.version = STORAGE_VERSION + 1)],
    ['a version written as text', (save) => (save.version = String(STORAGE_VERSION))],
    ['no version', (save) => delete (save as unknown as Row).version],
    ['a part it should not have', (save) => ((save as unknown as Row).extra = 1)],
    ['no field', (save) => delete (save as unknown as Row).machine],
    ['a field that is a list', (save) => ((save as unknown as Row).machine = [])],
    ['no numbers', (save) => delete (save as unknown as Row).session],
    ['numbers that are null', (save) => ((save as unknown as Row).session = null)],
    ['no screen', (save) => delete (save as unknown as Row).screen],
    ['a screen that is a list', (save) => ((save as unknown as Row).screen = [])],
    ['a screen that is null', (save) => ((save as unknown as Row).screen = null)],

    // The purse and the counters
    ['a purse in debt', (save) => (save.session.credits = -1)],
    ['half a medal in the purse', (save) => (save.session.credits = 99.5)],
    ['a purse written as text', (save) => (save.session.credits = '100')],
    ['a purse that is not a number', (save) => (save.session.credits = Number.NaN)],
    ['no purse', (save) => delete save.session.credits],
    ['an absurd purse', (save) => (save.session.credits = LIMITS.purse + 1)],
    ['a jackpot below where it starts', (save) => (save.session.jackpot = JACKPOT_START - 1)],
    ['a jackpot of no medals', (save) => (save.session.jackpot = 0)],
    ['an absurd jackpot', (save) => (save.session.jackpot = LIMITS.purse + 1)],
    ['a jackpot with a fraction', (save) => (save.session.jackpot = JACKPOT_START + 0.5)],
    ['jackpot progress past its step', (save) => (save.session.jackpotProgress = JACKPOT_STEP)],
    ['negative jackpot progress', (save) => (save.session.jackpotProgress = -1)],
    ['more spins held than the machine holds', (save) => (save.session.stock = MAX_STOCK + 1)],
    ['fewer than no spins held', (save) => (save.session.stock = -1)],
    ['a piece off the end of the board', (save) => (save.session.square = BOARD.length)],
    ['a piece before the start of the board', (save) => (save.session.square = -1)],
    ['a piece between two squares', (save) => (save.session.square = 1.5)],
    ['fewer than no balls waiting', (save) => (save.session.balls = -1)],
    ['an absurd number of balls waiting', (save) => (save.session.balls = LIMITS.balls + 1)],
    ['a negative count of medals dropped', (save) => (save.session.inserted = -1)],
    ['an absurd count of medals won', (save) => (save.session.won = LIMITS.count + 1)],
    ['a count that is infinite', (save) => (save.session.lost = Number.POSITIVE_INFINITY)],
    ['a count that is a list', (save) => (save.session.paidOut = [1])],
    ['a count that is true', (save) => (save.session.hits = true)],
    ['a negative count of wasted hits', (save) => (save.session.wasted = -3)],
    ['a count of spins with a fraction', (save) => (save.session.spins = 2.5)],
    ['a count of roulettes that is null', (save) => (save.session.roulettes = null)],
    ['a negative count of fevers', (save) => (save.session.fevers = -1)],
    ['a count of jackpots written as text', (save) => (save.session.jackpots = '0')],
    ['a negative count of refills', (save) => (save.session.refills = -1)],
    ['a tier missing from the tally', (save) => delete save.session.tiers.seven],
    ['a tier the slot does not have', (save) => (save.session.tiers.jackpot = 0)],
    ['a tier counted below zero', (save) => (save.session.tiers.miss = -1)],
    ['a tally that is a list', (save) => ((save.session as Row).tiers = [0, 0, 0, 0])],
    ['a quick pick that is not yes or no', (save) => (save.session.quickPick = 'no')],
    ['a number it should not have', (save) => (save.session.bonusMedals = 5)],
    ['the screen kept among the numbers', (save) => (save.session.spin = null)],

    // The field
    ['a clock running backwards', (save) => (save.machine.time = -1)],
    ['a clock that is not a number', (save) => (save.machine.time = Number.NaN)],
    ['a clock past its bound', (save) => (save.machine.time = LIMITS.clock * 2)],
    ['no clock', (save) => delete save.machine.time],
    ['a generator written into it', (save) => (save.machine.rng = 12345)],
    ['medals that are not a list', (save) => ((save.machine as Row).medals = 'none')],
    [
      'more medals than the tables hold',
      (save) => {
        const nextId = save.machine.nextId as number;
        for (let i = 0; i <= LIMITS.medals; i++) save.machine.medals.push({ ...loose(save), id: nextId + i });
        save.machine.nextId = nextId + LIMITS.medals + 1;
      },
    ],
    ['a payout queue below zero', (save) => (save.machine.payoutQueue = -1)],
    ['half a medal in the payout queue', (save) => (save.machine.payoutQueue = 0.5)],
    ['an absurd payout queue', (save) => (save.machine.payoutQueue = LIMITS.purse + 1)],
    ['a payout clock running backwards', (save) => (save.machine.payoutClock = -0.1)],
    ['a payout clock past a minute', (save) => (save.machine.payoutClock = LIMITS.timer + 1)],
    ['a tower clock that is not a number', (save) => (save.machine.towerClock = Number.NaN)],
    ['a slot’s wait below zero', (save) => (save.machine.waits = [0, -1])],
    ['a wait longer than a slot ever waits', (save) => (save.machine.waits = [DROP_INTERVAL * 2, 0])],
    ['a wait for one slot only', (save) => (save.machine.waits = [0.05])],
    ['a wait for a third slot', (save) => (save.machine.waits = [0, 0.1, 0])],
    ['one wait for both slots, as the version before wrote it', (save) => (save.machine.waits = 0.1)],
    ['no waits', (save) => delete save.machine.waits],
    ['a wait written as text', (save) => (save.machine.waits = ['0', 0.1])],
    ['more medals to stack than the towers are waiting for', (save) => (save.machine.growing = (save.machine.growing as number) + 1)],
    ['no medals to stack while towers are waiting', (save) => (save.machine.growing = 0)],
    ['a next id of zero', (save) => (save.machine.nextId = 0)],
    ['a next id a medal already has', (save) => (save.machine.nextId = loose(save).id)],
    ['a next id past its bound', (save) => (save.machine.nextId = LIMITS.count + 1)],

    // A medal
    ['a medal that is null', (save) => ((save.machine.medals as unknown[])[0] = null)],
    ['a medal that is a number', (save) => ((save.machine.medals as unknown[])[0] = 7)],
    ['a medal with a field missing', (save) => delete loose(save).grown],
    ['a medal with a field too many', (save) => (loose(save).colour = 'gold')],
    ['a medal nowhere across the field', (save) => (loose(save).x = Number.NaN)],
    ['a medal far off to the right', (save) => (loose(save).x = 500)],
    ['a medal far off to the left', (save) => (loose(save).x = -50)],
    ['a medal far behind the back wall', (save) => (loose(save).y = -50)],
    ['a medal far beyond the front', (save) => (loose(save).y = 1e6)],
    ['a medal whose place is text', (save) => (loose(save).y = '40')],
    ['a medal on a third table', (save) => (loose(save).level = 2)],
    ['a medal on a table below the lower one', (save) => (loose(save).level = -1)],
    ['a medal in a third tier', (save) => (loose(save).tier = 2)],
    ['a medal between two tiers', (save) => (loose(save).tier = 0.5)],
    ['a medal whose tier is true', (save) => (loose(save).tier = true)],
    ['a stack of no medals', (save) => (loose(save).stack = 0)],
    ['a tower taller than the tallest', (save) => (loose(save).stack = TOWER.max + 1)],
    ['a tower that will be taller than the tallest', (save) => (tower(save).stack = TOWER.max)],
    ['a tower waiting for fewer than no medals', (save) => (tower(save).grow = -1)],
    ['a ball that is a tower', (save) => (ball(save).stack = 2)],
    ['a ball that is a number', (save) => (ball(save).ball = 1)],
    ['a medal that has taken up no room', (save) => (loose(save).grown = 0)],
    ['a medal that has taken up more than its room', (save) => (loose(save).grown = 1.5)],
    ['a medal that dropped before the machine was on', (save) => (loose(save).sinceDrop = -2)],
    ['a medal with no id', (save) => (loose(save).id = 0)],
    ['a medal with half an id', (save) => (loose(save).id = 1.5)],
    ['a medal with an id not yet given out', (save) => (loose(save).id = save.machine.nextId)],
    ['two medals with one id', (save) => (save.machine.medals[1].id = save.machine.medals[0].id)],
    ['a medal in the air with the id of one lying down', (save) => (inAir(save).id = loose(save).id)],
    [
      'more balls than a field ever holds',
      (save) => {
        for (const medal of save.machine.medals) if (medal.stack === 1 && medal.grow === 0) medal.ball = true;
      },
    ],

    // A medal in the air
    ['medals in the air that are not a list', (save) => ((save.machine as Row).falling = {})],
    [
      'more medals in the air than every tower holds',
      (save) => {
        const nextId = save.machine.nextId as number;
        for (let i = 0; i <= LIMITS.falling; i++) save.machine.falling.push({ ...inAir(save), id: nextId + i });
        save.machine.nextId = nextId + LIMITS.falling + 1;
      },
    ],
    ['a medal in the air from nobody', (save) => (inAir(save).source = 'thrown')],
    ['a fall that takes no time', (save) => (inAir(save).duration = 0)],
    ['a fall with more time left than it takes', (save) => (inAir(save).remaining = (inAir(save).duration as number) + 1)],
    ['a fall with less than no time left', (save) => (inAir(save).remaining = -1)],
    ['a fall that takes for ever', (save) => (inAir(save).duration = Number.POSITIVE_INFINITY)],
    ['a medal off the top of the tallest tower', (save) => (inAir(save).rank = TOWER.max)],
    ['a medal in the air towards a third table', (save) => (inAir(save).level = 3)],
    ['a medal let go far outside the field', (save) => (inAir(save).fromX = 1000)],
    ['a medal let go from nowhere', (save) => (inAir(save).fromY = null)],
    ['a medal in the air with a field missing', (save) => delete inAir(save).rank],

    // The feed arms
    ['no aims', (save) => delete save.machine.aims],
    ['an aim that is not a number', (save) => (save.machine.aims = [armStart(0), Number.NaN])],
    ['an aim written as text', (save) => (save.machine.aims = ['43', 50])],
    ['an aim short of where the arms can point', (save) => (save.machine.aims = [AIM.min - 0.5, 50])],
    ['an aim past where the arms can point', (save) => (save.machine.aims = [armStart(0), AIM.max + 0.5])],
    ['the left arm pointed further right than it reaches', (save) => (save.machine.aims = [ARM_REACH[0].max + 0.5, 70])],
    ['the right arm pointed further left than it reaches', (save) => (save.machine.aims = [30, ARM_REACH[1].min - 0.5])],
    ['the two arms pointed across each other', (save) => (save.machine.aims = [55, 45])],
    ['an aim for one arm only', (save) => (save.machine.aims = [50])],
    ['one aim for both arms, as the version before wrote it', (save) => (save.machine.aims = 50)],
    ['the one aim and the one wait of the version before, beside its own', (save) => Object.assign(save.machine, { aim: 50, cooldown: 0 })],
    ['no rails', (save) => delete (save.machine as Row).rolling],
    ['rails that are not a list', (save) => ((save.machine as Row).rolling = {})],
    [
      'a machine with none of what the arms brought',
      (save) => {
        delete save.machine.aims;
        delete save.machine.waits;
        delete save.machine.tips;
        delete (save.machine as Row).rolling;
      },
    ],

    // The tips of the arms
    ['no tips', (save) => delete save.machine.tips],
    ['tips that are not a list', (save) => (save.machine.tips = { left: 36, right: 50 })],
    ['tips that are one number', (save) => (save.machine.tips = 50)],
    ['one tip', (save) => (save.machine.tips = [50])],
    ['three tips', (save) => (save.machine.tips = [36, 50, 64])],
    ['a tip that is nowhere', (save) => (save.machine.tips = [Number.NaN, 50])],
    ['a tip that is infinitely far off', (save) => (save.machine.tips = [36, Number.POSITIVE_INFINITY])],
    ['a tip written as text', (save) => (save.machine.tips = ['36', 50])],
    ['a tip that is null', (save) => (save.machine.tips = [36, null])],
    ['a left tip past the end of its arm’s reach', (save) => (save.machine.tips = [ARM_REACH[0].max + 0.5, 70])],
    ['a left tip outside the left wall', (save) => (save.machine.tips = [ARM_REACH[0].min - 0.5, 50])],
    ['a right tip short of where its arm reaches', (save) => (save.machine.tips = [36, ARM_REACH[1].min - 0.5])],
    ['a right tip outside the right wall', (save) => (save.machine.tips = [36, ARM_REACH[1].max + 0.5])],
    ['tips that have passed each other', (save) => (save.machine.tips = [55, 45])],
    ['tips the wrong way round by a hair', (save) => (save.machine.tips = [50.001, 50])],

    // A medal on a rail
    ['a medal on a rail that is null', (save) => ((save.machine.rolling as unknown[])[0] = null)],
    ['a medal on a rail with a field missing', (save) => delete onRail(save).arm],
    ['a medal on a rail that already has a landing spot', (save) => (onRail(save).x = 50)],
    ['a medal on a third arm', (save) => (onRail(save).arm = 2)],
    ['a medal between the two arms', (save) => (onRail(save).arm = 0.5)],
    ['a medal on an arm with a name', (save) => (onRail(save).arm = 'left')],
    ['a medal with more rail ahead of it than a rail is long', (save) => (onRail(save).remaining = ROLL_TIME + 0.01)],
    ['a medal past the tip and still on its rail', (save) => (onRail(save).remaining = -0.01)],
    ['a medal on a rail whose time is text', (save) => (onRail(save).remaining = '0.3')],
    ['a medal on a rail with no id', (save) => (onRail(save).id = 0)],
    ['a medal on a rail with an id not yet given out', (save) => (onRail(save).id = save.machine.nextId)],
    ['a medal on a rail with the id of one lying down', (save) => (onRail(save).id = loose(save).id)],
    ['a medal on a rail with the id of one in the air', (save) => (onRail(save).id = inAir(save).id)],
    // The slot feeds one medal and then waits, so the times on the rails have to fit its pace.
    ['a medal higher up its rail than the slot’s wait leaves room for', (save) => (onRail(save).remaining = ROLL_TIME)],
    ['a medal only just fed by a slot that has done waiting', (save) => (save.machine.waits = [0, 0])],
    ['a medal only just fed on the rail whose slot has done waiting', (save) => (onRail(save).arm = 0)],
    ['two medals on the rails closer together than the slot feeds them', (save) => another(save, DROP_INTERVAL / 2)],
    ['a second medal fed while the slot was still waiting for the first', (save) => another(save, -0.05)],
    [
      'medals on the rails out of the order they were fed in',
      (save) => {
        another(save, DROP_INTERVAL);
        save.machine.rolling.reverse();
      },
    ],
    [
      'more medals on the rails than the slot can have fed',
      (save) => {
        for (let i = 0; i < LIMITS.rolling; i++) another(save, 0.1);
      },
    ],

    // Jewels
    ['the version before jewels, on a machine that has them', (save) => (save.version = VERSION_BEFORE_JEWELS)],
    ['a jewel that says it is not one', (save) => (jewel(save).jewel = false)],
    ['a jewel marked with a number', (save) => (jewel(save).jewel = 1)],
    ['a medal that says it is not a jewel', (save) => (loose(save).jewel = false)],
    ['a jewel that is a ball as well', (save) => (jewel(save).ball = true)],
    ['a jewel that is a tower', (save) => (jewel(save).stack = 2)],
    [
      'a jewel with a tower still going up on it',
      (save) => {
        jewel(save).grow = 1;
        save.machine.growing = (save.machine.growing as number) + 1;
      },
    ],
    ['a jewel lying on top of the pile', (save) => (jewel(save).tier = 1)],
    // Every way a jewel is made puts it on the lower table, and nothing carries one up onto the pusher.
    ['a jewel on the pusher, where none can get', (save) => (jewel(save).level = 1)],
    ['a jewel on the pusher among its medals, as a medal there is stored', (save) => Object.assign(jewel(save), { level: 1, y: PUSHER.min })],
    ['a jewel on its way down from the pusher’s lip, which none has come over', (save) => (jewel(save).sinceDrop = 0.1)],
    ['a jewel that has just come over the lip', (save) => (jewel(save).sinceDrop = 0)],
    ['more jewels than a machine can hold', (save) => moreJewels(save, LIMITS.jewels + 1 - START_JEWELS)],
    ['a jewel in the air that the player fed', (save) => (jewelInAir(save).source = 'player')],
    ['a jewel in the air that is a ball as well', (save) => (jewelInAir(save).ball = true)],
    ['a jewel in the air over the pusher, where the hatch throws none', (save) => (jewelInAir(save).level = 1)],
    ['a jewel in the air off a tower', (save) => (jewelInAir(save).rank = 1)],
    // The hatch throws a jewel one way only: straight out, in the time its throw takes, onto the middle of the lower table.
    ['a jewel in the air that will land to one side of where the hatch throws', (save) => Object.assign(jewelInAir(save), { x: JEWEL_DROP.to + 0.5, fromX: JEWEL_DROP.to + 0.5 })],
    ['a jewel in the air that will land on the other side of it', (save) => Object.assign(jewelInAir(save), { x: JEWEL_DROP.from - 0.5, fromX: JEWEL_DROP.from - 0.5 })],
    ['a jewel in the air that will land short of where the hatch throws', (save) => (jewelInAir(save).y = JEWEL_DROP.near - 0.5)],
    ['a jewel in the air that will land past it', (save) => (jewelInAir(save).y = JEWEL_DROP.far + 0.5)],
    ['a jewel in the air thrown from somewhere that is not the hatch', (save) => (jewelInAir(save).fromY = RELEASE.depth + 4)],
    ['a jewel in the air thrown across the field', (save) => (jewelInAir(save).fromX = JEWEL_DROP.from)],
    ['a jewel in the air for longer than the hatch’s throw takes', (save) => (jewelInAir(save).duration = JEWEL_DROP.time + 0.1)],
    ['a jewel in the air for less than the throw takes', (save) => Object.assign(jewelInAir(save), { duration: JEWEL_DROP.time / 2, remaining: JEWEL_DROP.time / 4 })],
    ['a medal in the air that says it is not a jewel', (save) => (inAir(save).jewel = false)],
    ['as many lamps lit as there are', (save) => (save.session.jewels = JEWEL.lamps)],
    ['half a lamp lit', (save) => (save.session.jewels = 0.5)],
    ['fewer lamps lit than none', (save) => (save.session.jewels = -1)],
    ['no count of the lamps', (save) => delete save.session.jewels],
    ['no count of the jewel bonuses', (save) => delete save.session.jewelBonuses],
    ['half a jewel bonus', (save) => (save.session.jewelBonuses = 0.5)],
    ['jewel bonuses written as text', (save) => (save.session.jewelBonuses = '2')],
  ];

  it.each(cases)('refuses %s', (_name, damage) => {
    expect(restore(damaged(damage), 1)).toBeNull();
  });
});

describe('a save at the very edge of what a machine can be', () => {
  const cases: [string, (save: Save) => void][] = [
    ['an empty purse', (save) => (save.session.credits = 0)],
    ['the fullest purse', (save) => (save.session.credits = LIMITS.purse)],
    ['the biggest jackpot', (save) => (save.session.jackpot = LIMITS.purse)],
    ['jackpot progress one medal short of its step', (save) => (save.session.jackpotProgress = JACKPOT_STEP - 1)],
    ['every spin held', (save) => (save.session.stock = MAX_STOCK)],
    ['the piece on the last square', (save) => (save.session.square = BOARD.length - 1)],
    ['as many balls waiting as may wait', (save) => (save.session.balls = LIMITS.balls)],
    ['a quick pick', (save) => (save.session.quickPick = true)],
    ['a medal a diameter outside the left wall', (save) => (loose(save).x = -LIMITS.margin)],
    ['a medal a diameter beyond the front', (save) => (loose(save).y = FIELD.depth + LIMITS.margin)],
    [
      'a tower that will be as tall as the tallest',
      (save) => {
        // Its guard is still on the way up, so all but the one medal on the hatch are still to come.
        const one = tower(save);
        save.machine.growing = (save.machine.growing as number) + TOWER.max - 1 - (one.grow as number);
        one.grow = TOWER.max - 1;
        liftUnder(save, one).size = TOWER.max;
      },
    ],
    ['a medal that has only just landed', (save) => (loose(save).grown = SETTLE.from)],
    ['a medal that dropped this instant', (save) => (loose(save).sinceDrop = 0)],
    ['a slot that has only just fed a medal', (save) => (save.machine.waits = [0, DROP_INTERVAL])],
    ['both slots at the start of a wait', (save) => (save.machine.waits = [DROP_INTERVAL, DROP_INTERVAL])],
    ['a medal about to land', (save) => (inAir(save).remaining = 0)],
    [
      'a clock that has run for years',
      (save) => {
        // At a moment when the pusher is fully forward, each lift as far behind its lip as its tower stands.
        const time = Math.floor(LIMITS.clock / 2 / PUSHER.period) * PUSHER.period + PUSHER.period / 2;
        save.machine.time = time;
        for (const lift of liftsOf(save)) lift.behind = pusherFront(time) - (find(save.machine.medals, (medal) => medal.id === lift.id).y as number);
      },
    ],
    ['nothing in the air', (save) => (save.machine.falling = [])],
    ['arms pointed as far left as they go', (save) => (save.machine.aims = [ARM_REACH[0].min, ARM_REACH[1].min])],
    ['arms pointed as far right as they go', (save) => (save.machine.aims = [ARM_REACH[0].max, ARM_REACH[1].max])],
    ['both arms pointed at the same spot', (save) => (save.machine.aims = [53, 53])],
    ['arms pointed as far apart as they go', (save) => (save.machine.aims = [ARM_REACH[0].min, ARM_REACH[1].max])],
    ['the left tip at the far end of its reach', (save) => (save.machine.tips = [ARM_REACH[0].max, 70])],
    ['the right tip at the near end of its reach', (save) => (save.machine.tips = [36, ARM_REACH[1].min])],
    ['both tips over the same spot', (save) => (save.machine.tips = [53, 53])],
    ['the tips as far apart as they go', (save) => (save.machine.tips = [ARM_REACH[0].min, ARM_REACH[1].max])],
    ['an arm in the middle of its swing', (save) => (save.machine.tips = [20.5, 50])],
    ['nothing on the rails', (save) => (save.machine.rolling = [])],
    ['a medal at the very tip of its rail', (save) => (onRail(save).remaining = 0)],
    [
      'a medal on the other arm, with that arm’s slot the one that is waiting',
      (save) => {
        onRail(save).arm = 0;
        (save.machine.waits as number[]).reverse();
      },
    ],
    [
      'a medal that has only just gone in',
      (save) => {
        onRail(save).remaining = ROLL_TIME;
        save.machine.waits = [0, DROP_INTERVAL];
      },
    ],
    ['a second medal a whole wait further down the rail', (save) => another(save, DROP_INTERVAL)],
    [
      'as many medals on a rail as its slot can have fed',
      (save) => {
        for (let i = 1; i < Math.ceil(ROLL_TIME / DROP_INTERVAL); i++) another(save, DROP_INTERVAL);
      },
    ],
    [
      'a field with no medals on it at all',
      (save) => {
        save.machine.medals = [];
        save.machine.falling = [];
        save.machine.growing = 0;
        save.machine.lifts = [];
      },
    ],
    ['every jewel lamp but the last lit', (save) => (save.session.jewels = JEWEL.lamps - 1)],
    ['a great many jewel bonuses paid', (save) => (save.session.jewelBonuses = LIMITS.count)],
    ['a jewel in the air', (save) => void jewelInAir(save)],
    ['as many jewels as a machine can hold', (save) => moreJewels(save, LIMITS.jewels - START_JEWELS)],
    [
      'no jewel on the field',
      (save) => {
        for (const medal of save.machine.medals) delete medal.jewel;
      },
    ],
  ];

  it.each(cases)('keeps %s, and the machine runs', (_name, change) => {
    const text = damaged(change);
    expect(text).not.toBe(GOOD);
    const back = restore(text, 1);
    expect(back).not.toBeNull();
    for (let i = 0; i < 30; i++) advance(back as Session, DT);
    expect(everyPosition(back as Session).every(Number.isFinite)).toBe(true);
  });
});

// ── The feed arms ───────────────────────────────────────────────────────────

/** Feeds medals as fast as the slot takes them for `seconds`, to the left and to the right by turns. */
function stream(session: Session, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    insertAt(session, session.inserted % 2 === 0 ? 30 : 70);
    advance(session, DT);
  }
}

/** Machines taken from play, one at each state the arms pass through. */
const ARMS_AT: Record<string, () => Session> = {
  'a medal only just fed': () => {
    const session = createSession(8, { balls: 0 });
    insertAt(session, 30);
    return session;
  },
  'a medal half way down its rail': () => {
    const session = createSession(8, { balls: 0 });
    insertAt(session, 70);
    for (let i = 0; i < Math.round(ROLL_TIME / 2 / DT); i++) advance(session, DT);
    return session;
  },
  'two medals on one rail': () => {
    const session = createSession(8, { balls: 0 });
    for (let i = 0; i < 14; i++) {
      insertAt(session, 30);
      advance(session, DT);
    }
    return session;
  },
  'as many medals as the rails hold, on both arms': () => {
    const session = createSession(8, { balls: 0 });
    // Each slot takes a medal every eleventh step, the right one a step behind the left. Three steps after the
    // left arm's fifth, the first on either rail is still on it.
    stream(session, (4 * 11 + 3) * DT);
    return session;
  },
  'a medal in the air and the rail full behind it': () => {
    const session = createSession(8, { balls: 0 });
    for (let i = 0; i < Math.round((ROLL_TIME + 0.05) / DT); i++) {
      insertAt(session, 30);
      advance(session, DT);
    }
    return session;
  },
  'the arms swung away from under a medal': () => {
    const session = createSession(8, { balls: 0 });
    insertAt(session, 30);
    for (let i = 0; i < 12; i++) advance(session, DT);
    aimBoth(session.machine, 88);
    for (let i = 0; i < 3; i++) advance(session, DT);
    return session;
  },
};

describe('the arms caught at each of their states', () => {
  const saved = (name: string): Save => JSON.parse(serialize(ARMS_AT[name]()));

  it.each(Object.keys(ARMS_AT))('comes back as it was: %s', (name) => {
    const session = ARMS_AT[name]();
    const back = reread(session);
    expect(serialize(back)).toBe(serialize(session));
    expect(back.machine.rolling).toEqual(session.machine.rolling);
    expect(back.machine.aims).toEqual(session.machine.aims);
    expect(back.machine.waits).toEqual(session.machine.waits);
    expect(medalsOnField(back.machine)).toBe(medalsOnField(session.machine));
  });

  it('is the state its name says', () => {
    const fed = saved('a medal only just fed').machine;
    expect(fed.rolling).toEqual([{ id: expect.any(Number), arm: 0, remaining: ROLL_TIME }]);
    expect(fed).toMatchObject({ waits: [DROP_INTERVAL, 0], aims: [30, armStart(1)], falling: [] });
    // No step has run since: the tips are still where a new machine has them, the left one yet to set off.
    expect(fed.tips).toEqual([armStart(0), armStart(1)]);
    const half = saved('a medal half way down its rail').machine;
    expect(half.rolling).toHaveLength(1);
    expect(half.rolling[0]).toMatchObject({ arm: 1 });
    expect(half.rolling[0].remaining).toBeCloseTo(ROLL_TIME / 2, 9);
    expect(half).toMatchObject({ waits: [0, 0], aims: [armStart(0), 70], tips: [armStart(0), 70] });
    const two = saved('two medals on one rail').machine;
    expect(two.rolling.map((medal) => medal.arm)).toEqual([0, 0]);
    expect((two.rolling[1].remaining as number) - (two.rolling[0].remaining as number)).toBeCloseTo(11 * DT, 9);
    expect(two.tips).toEqual([30, armStart(1)]);
    const three = saved('as many medals as the rails hold, on both arms').machine;
    expect(three.rolling.map((medal) => medal.arm)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
    expect(three.rolling).toHaveLength(LIMITS.rolling);
    expect(three.falling).toEqual([]);
    // Each arm has been over its own aim all the while, and each slot is in the middle of its own wait: the left
    // one three steps into it and the right one two.
    expect(three).toMatchObject({ aims: [30, 70], tips: [30, 70] });
    expect((three.waits as number[])[0]).toBeCloseTo(DROP_INTERVAL - 3 * DT, 9);
    expect((three.waits as number[])[1]).toBeCloseTo(DROP_INTERVAL - 2 * DT, 9);
    const off = saved('a medal in the air and the rail full behind it').machine;
    expect(off.rolling.map((medal) => medal.arm)).toEqual([0, 0, 0, 0, 0]);
    expect(off.rolling).toHaveLength(LIMITS.rolling / 2);
    expect(off.falling).toHaveLength(1);
    expect(off.falling[0]).toMatchObject({ source: 'player', duration: FALL_TIME });
    expect(off.falling[0].id).toBeLessThan(off.rolling[0].id as number);
    // The left arm has been over its aim all the while, and the medal left from where its tip still is. The right one never stirred.
    expect(off.tips).toEqual([30, armStart(1)]);
    expect(off.falling[0].fromX).toBe(30);
    const away = saved('the arms swung away from under a medal').machine;
    expect(away.rolling[0]).toMatchObject({ arm: 0 });
    // Both were pointed as near to 88 as they go.
    expect(away.aims).toEqual([ARM_REACH[0].max, 88]);
    // Three steps into their swing: the left arm far short of the end of its reach, the right arm far short of its aim.
    const swinging = away.tips as number[];
    expect(swinging[0]).toBeCloseTo(30 + 3 * ARM_SPEED * DT, 9);
    expect(swinging[1]).toBeCloseTo(armStart(1) + 3 * ARM_SPEED * DT, 9);
    expect(swinging[0]).toBeLessThan(ARM_REACH[0].max - 10);
  });

  // One thing changed in a good save, into something the arms never do.
  const rails = (save: Save): Row[] => save.machine.rolling;
  const impossible: [string, string, (save: Save) => void][] = [
    ['a medal only just fed', 'went in while its slot was not feeding', (save) => (save.machine.waits = [0, 0])],
    ['a medal only just fed', 'went in at the other arm’s slot, by the waits', (save) => (save.machine.waits = [0, DROP_INTERVAL])],
    ['a medal only just fed', 'is on an arm the machine does not have', (save) => (onRail(save).arm = -1)],
    ['a medal only just fed', 'has an id that has not been given out', (save) => (save.machine.nextId = onRail(save).id)],
    ['a medal only just fed', 'has a landing spot before it has left its arm', (save) => (onRail(save).x = 30)],
    ['a medal half way down its rail', 'is back at the top of it, the slot long done waiting', (save) => (onRail(save).remaining = ROLL_TIME)],
    ['a medal half way down its rail', 'is past the tip', (save) => (onRail(save).remaining = -DT)],
    ['two medals on one rail', 'are at the same place on it', (save) => (rails(save)[0].remaining = rails(save)[1].remaining)],
    ['two medals on one rail', 'are one medal twice', (save) => (rails(save)[0].id = rails(save)[1].id)],
    ['two medals on one rail', 'have the second ahead of the first', (save) => rails(save).reverse()],
    ['two medals on one rail', 'have the first only just fed as well', (save) => (rails(save)[0].remaining = ROLL_TIME - DT)],
    [
      'as many medals as the rails hold, on both arms',
      'have one more behind them',
      (save) => {
        rails(save).push({ id: save.machine.nextId, arm: 1, remaining: ROLL_TIME });
        save.machine.nextId = (save.machine.nextId as number) + 1;
        (save.machine.waits as number[])[1] = DROP_INTERVAL;
      },
    ],
    ['as many medals as the rails hold, on both arms', 'have the second on a rail as far down it as the first', (save) => (rails(save)[2].remaining = rails(save)[0].remaining)],
    ['as many medals as the rails hold, on both arms', 'have the last one fed before the slot could', (save) => (rails(save)[2].remaining = (rails(save)[2].remaining as number) - 0.1)],
    [
      'a medal in the air and the rail full behind it',
      'still has that medal on its rail',
      (save) => {
        rails(save).unshift({ id: inAir(save).id, arm: 0, remaining: 0 });
      },
    ],
    ['a medal in the air and the rail full behind it', 'has it falling for longer than a fall takes', (save) => (inAir(save).remaining = FALL_TIME + 0.01)],
    ['a medal only just fed', 'is on a machine with one arm’s tip missing', (save) => (save.machine.tips = [armStart(0)])],
    ['as many medals as the rails hold, on both arms', 'have the two tips past each other', (save) => (save.machine.tips as number[]).reverse()],
    ['the arms swung away from under a medal', 'has swung its left arm past the end of its reach', (save) => ((save.machine.tips as number[])[0] = ARM_REACH[0].max + 1)],
    ['the arms swung away from under a medal', 'has its right arm further left than it reaches', (save) => ((save.machine.tips as number[])[1] = ARM_REACH[1].min - 1)],
    ['the arms swung away from under a medal', 'has an arm that is nowhere', (save) => ((save.machine.tips as unknown[])[0] = null)],
    ['the arms swung away from under a medal', 'have an arm pointed out of the field', (save) => ((save.machine.aims as number[])[1] = FIELD.width)],
    ['the arms swung away from under a medal', 'have the right arm pointed to the left of the left one', (save) => ((save.machine.aims as number[])[1] = 50)],
    ['the arms swung away from under a medal', 'point nowhere', (save) => (save.machine.aims = null)],
  ];

  it.each(impossible)('%s that %s is no machine', (name, _what, change) => {
    const save = saved(name);
    const before = JSON.stringify(save);
    expect(restore(before, 1)).not.toBeNull();
    change(save);
    const text = JSON.stringify(save);
    expect(text).not.toBe(before);
    expect(restore(text, 1)).toBeNull();
  });

  it('plays on from each of them exactly as the machine it was taken from, given the same draws', { timeout: LONG }, () => {
    for (const name of Object.keys(ARMS_AT)) {
      const session = ARMS_AT[name]();
      session.machine.rng = seededRng(77);
      const back = reread(session, 77);
      const landed: number[] = [];
      for (let i = 0; i < 150; i++) {
        for (const machine of [session, back]) {
          // Medals go on being fed, and the arms go on moving under the ones on their rails.
          if (i % 13 === 0) insertAt(machine, 20 + ((i * 7) % 60));
          aimBoth(machine.machine, 30 + ((i * 3) % 40));
          const events: SessionEvent[] = [];
          advance(machine, DT, events);
          landed.push(events.reduce((sum, event) => sum + (event.type === 'landed' ? event.count : 0), 0));
        }
      }
      // Each landed its medals in the same steps as the other, and they end as the same machine.
      expect(landed.filter((_count, index) => index % 2 === 0)).toEqual(landed.filter((_count, index) => index % 2 === 1));
      expect(landed.reduce((sum, count) => sum + count, 0)).toBeGreaterThan(10);
      expect(serialize(back), name).toBe(serialize(session));
    }
  });
});

describe('a save written before the machine had its feed arms', () => {
  // Written by the game as it was before the arms, with that version's own `serialize`: see the fixture's `about`.
  const OLD = beforeArms.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = beforeArms;
  const total = (events: SessionEvent[], type: 'landed' | 'won' | 'lost'): number =>
    events.reduce((sum, event) => sum + (event.type === type ? event.count : 0), 0);

  it('is a save of version 1: medals in the air, nothing on a rail and no aim', () => {
    const save = old();
    expect(save.version).toBe(VERSION_BEFORE_ARMS);
    expect(save.version).not.toBe(STORAGE_VERSION);
    expect(save.machine).not.toHaveProperty('rolling');
    expect(save.machine).not.toHaveProperty('aim');
    expect(save.machine).not.toHaveProperty('tips');
    // It was caught in the middle of a stream: three of the player's medals in the air, four the machine paid,
    // the slot still waiting from the last one fed, and a spin on its screen.
    expect(save.machine.falling.filter((medal) => medal.source === 'player')).toHaveLength(3);
    expect(save.machine.falling.filter((medal) => medal.source === 'payout')).toHaveLength(4);
    expect(save.machine.cooldown).toBeGreaterThan(0);
    expect(save.screen.spin).not.toBeNull();
    expect(save.session.inserted).toBeGreaterThan(100);
    expect(save.machine.medals.length).toBeGreaterThan(300);
  });

  it('reads back as the same machine, its arms empty and pointing at the middle', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    // The field is what was written, to the last digit, with what the arms brought added to it.
    const { rng: _rng, rolling, aims, waits, tips, hopper, lifts, ...field } = back.machine;
    const { cooldown, ...tables } = save.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(tables));
    // That game had no payout works: the doors are shut, and it was building no tower for a lift to be under.
    expect(hopper).toEqual(shutHopper());
    expect(lifts).toEqual([]);
    expect(rolling).toEqual([]);
    // That game had one slot: neither arm's slot is free until it would have been.
    expect(waits).toEqual([cooldown, cooldown]);
    // The arms are where a new machine's are, and pointed there: nothing swings when it starts up again.
    expect(aims).toEqual([armStart(0), armStart(1)]);
    expect(tips).toEqual([armStart(0), armStart(1)]);
    expect(tips).toEqual(createSession(1).machine.tips);
    expect([armGoal(back.machine, 0), armGoal(back.machine, 1)]).toEqual(tips);
    // So are the purse and the counters, and the spin it was in the middle of.
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersToday(save.session)));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
    // Not a medal more or fewer on the field than were written.
    const lying = save.machine.medals.reduce((sum, medal) => sum + (medal.ball ? 0 : (medal.stack as number) + (medal.grow as number)), 0);
    const inTheAir = save.machine.falling.filter((medal) => !medal.ball).length;
    expect(medalsOnField(back.machine)).toBe(lying + inTheAir + (save.machine.payoutQueue as number));
  });

  it('has its medals in the air already in their fall: each lands where and when it was going to', () => {
    const back = restore(OLD, then.seed) as Session;
    const falling = old().machine.falling;
    const start = back.machine.time;
    // None of them is put back on a rail, and none waits out a roll: each has the landing spot and the
    // time it was written with, and the last is down within a fall's length.
    expect(back.machine.falling).toEqual(falling);
    const downAt = new Map<number, number>();
    for (let i = 0; i < Math.round(FALL_TIME / DT) + 1; i++) {
      const before = new Map(back.machine.falling.map((medal) => [medal.id, medal]));
      advance(back, DT);
      const lying = new Map(back.machine.medals.map((medal) => [medal.id, medal]));
      for (const [id, medal] of before) {
        const down = lying.get(id);
        if (!down) continue;
        downAt.set(id, back.machine.time - start);
        // It lies on the pusher at the spot the save gave it, less whatever the pile has nudged it in the step it landed.
        expect(down.level).toBe(1);
        expect(Math.hypot(down.x - medal.x, down.y - medal.y)).toBeLessThan(MEDAL_RADIUS);
      }
    }
    expect(back.machine.rolling).toEqual([]);
    expect(downAt.size).toBe(falling.length);
    for (const medal of falling) {
      const landed = downAt.get(medal.id as number) ?? Number.NaN;
      expect(landed).toBeGreaterThanOrEqual((medal.remaining as number) - 1e-9);
      expect(landed).toBeLessThan((medal.remaining as number) + DT + 1e-9);
    }
  });

  it('plays on as the game that wrote it did: the same field to the last medal, and spins by today’s rule', () => {
    const back = restore(OLD, then.seed) as Session;
    const at = { hits: back.hits, stock: back.stock, spins: back.spins, wasted: back.wasted };
    const events: SessionEvent[] = [];
    for (let i = 0; i < then.steps; i++) advance(back, DT, events);
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    // The field is the field it was: as many medals land, as many leave by the front and by the sides, and the purse is the same.
    expect(total(events, 'landed')).toBe(then.landed);
    expect(total(events, 'won')).toBe(then.won);
    expect(total(events, 'lost')).toBe(then.lost);
    expect([back.credits, back.paidOut]).toEqual([then.credits, then.paidOut]);
    // What starts a spin is not what it was. Then, one of the medals in the air came down through the centre gate
    // as it swept by. Now landing starts nothing: the medals that count are the ones the pusher takes over its lip
    // through a chucker, and some of this machine's were on their way there.
    expect(then.gates).toEqual([1]);
    const through = events.flatMap((event) => (event.type === 'checker' ? [event.gate] : []));
    expect(through.length).toBeGreaterThan(0);
    expect(through.every((chucker) => chucker >= 0 && chucker < CHECKERS.positions.length)).toBe(true);
    expect(back.hits - at.hits).toBe(through.length);
    // Each of them was spun, is held, or found the hold full, and the hold never went over what it holds.
    expect(back.hits - at.hits).toBe(back.spins - at.spins + (back.stock - at.stock) + (back.wasted - at.wasted));
    expect(back.stock).toBeLessThanOrEqual(MAX_STOCK);
    // It was holding seven when it was saved, more than the screen could play in the time: as many spins as then,
    // or more, since a medal that finds the hold full now turns a held spin gold, and a gold spin is quick.
    expect(at.stock).toBe(7);
    expect(back.spins).toBeGreaterThanOrEqual(then.spins);
    expect(back.gilded).toBe(events.filter((event) => event.type === 'checker' && event.gold).length);
    expect(back.machine.medals).toHaveLength(then.medals);
    expect(back.machine.falling).toHaveLength(then.falling);
    // And each of them lies where that game's machine left it.
    expect(then.resting).toHaveLength(7);
    for (const rest of then.resting) {
      const medal = back.machine.medals.find((m) => m.id === rest.id);
      expect(medal).toMatchObject({ level: rest.level, tier: rest.tier });
      expect(medal?.x).toBeCloseTo(rest.x, 6);
      expect(medal?.y).toBeCloseTo(rest.y, 6);
    }
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    const again = JSON.parse(text) as Save;
    expect(again.version).toBe(STORAGE_VERSION);
    expect(again.machine).toMatchObject({ rolling: [], aims: [armStart(0), armStart(1)], tips: [armStart(0), armStart(1)], waits: [old().machine.cooldown, old().machine.cooldown] });
    expect(again.machine.falling).toHaveLength(7);
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('carries on the same way each time it is read, with medals down the arms from then on', { timeout: LONG }, () => {
    const [first, second] = [restore(OLD, 5) as Session, restore(OLD, 5) as Session];
    const before = first.inserted;
    let onRails = 0;
    for (let i = 0; i < 300; i++) {
      for (const machine of [first, second]) {
        if (machine.credits === 0) refill(machine);
        if (i % 12 === 0) insertAt(machine, 20 + ((i * 7) % 60));
        advance(machine, DT);
      }
      onRails = Math.max(onRails, first.machine.rolling.length);
      if (i % 50 === 0) expect(restore(serialize(first), 1)).not.toBeNull();
    }
    expect(first.inserted).toBeGreaterThanOrEqual(before + 24);
    expect(onRails).toBeGreaterThanOrEqual(2);
    expect(serialize(second)).toBe(serialize(first));
    expect(everyPosition(first).every(Number.isFinite)).toBe(true);
  });

  it('loses a spin that has gone wrong and nothing else, like a save of this version', () => {
    const save = old();
    (save.screen.spin as Row).done = true;
    const back = restore(JSON.stringify(save), 1);
    expect(back).not.toBeNull();
    expect(back?.spin).toBeNull();
    expect(back?.credits).toBe(save.session.credits);
    expect(back?.machine.falling).toHaveLength(7);
  });

  // That version's field is held to that version's shape: one thing changed, and it is no save of either version.
  const spoilt: [string, (save: Save) => void][] = [
    ['given an aim, which that game never wrote', (save) => (save.machine.aim = 50)],
    ['given rails, which that game did not have', (save) => (save.machine.rolling = [])],
    ['given tips, for arms that game did not have', (save) => (save.machine.tips = [armStart(0), armStart(1)])],
    ['given an aim for each arm, as this version writes them', (save) => (save.machine.aims = [armStart(0), armStart(1)])],
    ['given a wait for each slot beside its one', (save) => (save.machine.waits = [0, 0])],
    [
      'given all three, under its old version',
      (save) => {
        save.machine.aim = 50;
        save.machine.tips = [armStart(0), armStart(1)];
        save.machine.rolling = [];
      },
    ],
    ['called a save of this version', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of a version before any', (save) => (save.version = 0)],
    ['with a medal in the air that has lost its landing spot', (save) => delete save.machine.falling[1].x],
    ['with a medal in the air that is on an arm', (save) => (save.machine.falling[1].arm = 0)],
    ['with a medal in the air that has more of its fall left than a fall takes', (save) => (save.machine.falling[1].remaining = FALL_TIME + 0.1)],
    ['with two medals in the air that are one medal', (save) => (save.machine.falling[1].id = save.machine.falling[2].id)],
    ['with a slot that waits longer than it ever did', (save) => (save.machine.cooldown = DROP_INTERVAL * 2)],
    ['with a purse in debt', (save) => (save.session.credits = -1)],
    ['with a field missing from its machine', (save) => delete save.machine.payoutQueue],
  ];

  it.each(spoilt)('is refused when it is %s', (_name, spoil) => {
    const save = old();
    spoil(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });
});

describe('a save written while the START gates still swept the back panel', () => {
  // Written by the game as it was the day before the chuckers moved to the pusher's lip, with that day's own
  // `serialize`: see the fixture's `about`. The rule has changed since and the shape of a save has not.
  const OLD = beforeLipChuckers.save;
  const old = (): Save => JSON.parse(OLD);

  it('is a save of the version before this one, caught in the middle of a stream', () => {
    const save = old();
    expect(save.version).toBe(VERSION_WITH_ONE_AIM);
    expect(Object.keys(asToday(save.machine)).sort()).toEqual(Object.keys(JSON.parse(serialize(createSession(1))).machine).sort());
    expect(Object.keys(numbersToday(save.session)).sort()).toEqual(Object.keys(JSON.parse(serialize(createSession(1))).session).sort());
    // Three medals on a rail, three of the player's and four the machine paid in the air, more to be paid,
    // the slot still waiting from the last one fed, a spin on the screen and seven more held.
    expect(save.machine.rolling).toHaveLength(3);
    expect(save.machine.falling.filter((medal) => medal.source === 'player')).toHaveLength(3);
    expect(save.machine.falling.filter((medal) => medal.source === 'payout')).toHaveLength(4);
    expect(save.machine.payoutQueue).toBeGreaterThan(0);
    expect(save.machine.cooldown).toBeGreaterThan(0);
    expect(save.screen.spin).toMatchObject({ done: false });
    expect(save.session.stock).toBe(7);
    expect(save.session.inserted).toBeGreaterThan(1000);
    expect(save.machine.medals.length).toBeGreaterThan(300);
  });

  it('reads back as the same machine, to the last digit', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    // Written again it is the same machine in today's shape: each arm with the one aim, each slot with the one wait.
    expect(serialize(back)).toBe(writtenToday(OLD));
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(asToday(save.machine)));
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersToday(save.session)));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
    // Its arms are where they were, the one with medals on its rail over the aim and the other at the rest it had then.
    // Each is pointed at that one aim now, so the first stays and the second swings over.
    expect(back.machine.tips).toEqual(save.machine.tips);
    expect(back.machine.aims).toEqual([tipOf(0, save.machine.aim as number), tipOf(1, save.machine.aim as number)]);
    expect(back.machine.rolling.every((medal) => medal.arm === 1)).toBe(true);
  });

  it('brings its medals down where they were going, and none of them starts a spin by landing', () => {
    const back = restore(OLD, 77) as Session;
    const save = old();
    const waiting = save.machine.rolling.length + save.machine.falling.length;
    const before = { hits: back.hits, medals: back.machine.medals.length };
    const events: SessionEvent[] = [];
    // Long enough for the last medal on a rail to roll off and fall; nothing is fed meanwhile.
    for (let i = 0; i < Math.round((ROLL_TIME + FALL_TIME) / DT) + 2; i++) advance(back, DT, events);
    expect(back.machine.rolling).toEqual([]);
    const landed = events.reduce((sum, event) => sum + (event.type === 'landed' ? event.count : 0), 0);
    expect(landed).toBeGreaterThanOrEqual(waiting);
    // Every one of them came down on the pusher, well behind its lip, where there is no chucker to go through.
    for (const medal of save.machine.falling) {
      expect(medal.level).toBe(1);
      expect(medal.y as number).toBeLessThan(PUSHER.min - MEDAL_RADIUS);
    }
    // Whatever went through a chucker in that second went over the lip to do it: there are that many more medals on the lower table's books.
    const through = events.filter((event) => event.type === 'checker').length;
    expect(back.hits - before.hits).toBe(through);
    expect(through).toBeLessThan(waiting);
  });

  it('plays on under the rule as it is now, and its books balance', { timeout: LONG }, () => {
    const back = restore(OLD, 77) as Session;
    const at = { hits: back.hits, stock: back.stock, spins: back.spins, wasted: back.wasted, inserted: back.inserted, paidOut: back.paidOut, won: back.won, lost: back.lost };
    const field = medalsOnField(back.machine);
    const events: SessionEvent[] = [];
    // Twenty seconds, two medals a second down the middle, the purse refilled when it is empty.
    for (let i = 0; i < 20 * 60; i++) {
      if (back.credits === 0) refill(back);
      if (i % 30 === 0) insertAt(back, FIELD.width / 2);
      advance(back, DT, events);
      if (i % 240 === 0) expect(restore(serialize(back), 1)).not.toBeNull();
    }
    expect(back.inserted - at.inserted).toBeGreaterThanOrEqual(39);
    // Not a medal has gone missing or come from nowhere, and the purse is what was fed and won.
    expect(field + (back.inserted - at.inserted) + (back.paidOut - at.paidOut)).toBe(medalsOnField(back.machine) + (back.won - at.won) + (back.lost - at.lost));
    expect(back.credits).toBe(START_CREDITS * (1 + back.refills) - back.inserted + back.won);
    // Medals went over the lip through the chuckers, and each was spun, is held, or found the hold full.
    const through = events.flatMap((event) => (event.type === 'checker' ? [event.gate] : []));
    expect(through.length).toBeGreaterThan(0);
    expect(through.every((chucker) => chucker >= 0 && chucker < CHECKERS.positions.length)).toBe(true);
    expect(back.hits - at.hits).toBe(through.length);
    expect(back.hits - at.hits).toBe(back.spins - at.spins + (back.stock - at.stock) + (back.wasted - at.wasted));
    expect(back.spins).toBeGreaterThan(at.spins);
    expect(back.stock).toBeLessThanOrEqual(MAX_STOCK);
    expect(everyPosition(back).every(Number.isFinite)).toBe(true);
    // And it is written down and read back like any machine of today's.
    expect(plain(reread(back))).toEqual(plain(back));
  });

  it('carries on the same way each time it is read', () => {
    const [first, second] = [restore(OLD, 5) as Session, restore(OLD, 5) as Session];
    for (let i = 0; i < 240; i++) {
      for (const machine of [first, second]) {
        if (machine.credits === 0) refill(machine);
        if (i % 12 === 0) insertAt(machine, 20 + ((i * 7) % 60));
        advance(machine, DT);
      }
    }
    expect(serialize(second)).toBe(serialize(first));
  });
});

describe('a save written while both rails shared one slot and one aim', () => {
  // Written by the game as it was the day before each rail had a slot and an aim of its own, with that day's own
  // `serialize`: see the fixture's `about`.
  const OLD = beforeLeftAndRight.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = beforeLeftAndRight;
  const total = (events: SessionEvent[], type: 'landed' | 'won' | 'lost'): number =>
    events.reduce((sum, event) => sum + (event.type === type ? event.count : 0), 0);

  it('is a save of version 2: one aim and one wait, with medals on both rails', () => {
    const save = old();
    expect(save.version).toBe(VERSION_WITH_ONE_AIM);
    expect(save.version).not.toBe(STORAGE_VERSION);
    expect(save.machine).not.toHaveProperty('aims');
    expect(save.machine).not.toHaveProperty('waits');
    // The aim was on the left. Both arms had medals on their rails, so both were following it: the left arm
    // is over it, and the right arm is as near to it as it reaches, which is less than a medal's width away.
    const aim = save.machine.aim as number;
    expect(aim).toBeLessThan(ARM_REACH[1].min);
    expect(save.machine.tips).toEqual([aim, ARM_REACH[1].min]);
    expect(save.machine.rolling.map((medal) => medal.arm)).toEqual([1, 1, 1, 0, 0]);
    // The one slot fed both rails, a wait apart, and was still waiting from the last one.
    const times = save.machine.rolling.map((medal) => medal.remaining as number);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeCloseTo(11 * DT, 9);
    expect(save.machine.cooldown).toBeGreaterThan(0);
    expect(save.machine.falling.filter((medal) => medal.source === 'player').length).toBeGreaterThanOrEqual(1);
    expect(save.screen.spin).not.toBeNull();
    expect(save.session.stock).toBeGreaterThanOrEqual(1);
  });

  it('reads back as the same machine, each arm pointed at the one aim as near as it reaches', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    const aim = save.machine.aim as number;
    expect(back.machine.aims).toEqual([aim, ARM_REACH[1].min]);
    expect(back.machine.aims).toEqual([tipOf(0, aim), tipOf(1, aim)]);
    // That game's one slot fed either rail, so neither slot is free until it would have been.
    expect(back.machine.waits).toEqual([save.machine.cooldown, save.machine.cooldown]);
    // Everything else is what was written, to the last digit: the tips, the medals on the rails, the tables.
    expect(back.machine.tips).toEqual(save.machine.tips);
    expect(back.machine.rolling).toEqual(save.machine.rolling);
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(asToday(save.machine)));
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersToday(save.session)));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
    // Both arms were following the aim, so both tips are over their aims already: nothing swings when it starts up again.
    expect([armGoal(back.machine, 0), armGoal(back.machine, 1)]).toEqual(back.machine.tips);
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    expect(text).toBe(writtenToday(OLD));
    const again = JSON.parse(text) as Save;
    expect(again.version).toBe(STORAGE_VERSION);
    expect(again.machine).not.toHaveProperty('aim');
    expect(again.machine).not.toHaveProperty('cooldown');
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('plays on exactly as the game that wrote it did: every medal leaves its arm where and when it was going to', () => {
    const back = restore(OLD, then.seed) as Session;
    const events: SessionEvent[] = [];
    const left: { id: number; arm: number; step: number; fromX: number }[] = [];
    for (let i = 0; i < then.steps; i++) {
      const arms = new Map(back.machine.rolling.map((medal) => [medal.id, medal.arm]));
      advance(back, DT, events);
      for (const medal of back.machine.falling) {
        const arm = arms.get(medal.id);
        if (arm !== undefined && !left.some((one) => one.id === medal.id)) left.push({ id: medal.id, arm, step: i, fromX: medal.fromX });
      }
    }
    // The three on the right rail left from the end of that arm's reach and the two on the left from over the aim,
    // each in the step it did then.
    expect(left).toEqual(then.left);
    expect(left.map((one) => one.arm)).toEqual([1, 1, 1, 0, 0]);
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    expect(total(events, 'landed')).toBe(then.landed);
    expect(total(events, 'won')).toBe(then.won);
    expect(total(events, 'lost')).toBe(then.lost);
    // The field is that game's field to the last medal. What starts a spin on it has been narrowed since: then, two
    // medals went over the lip through a pocket in these four seconds, the first through the right one and the
    // second through the middle one. The first is in line with today's narrower slot as well. The second went over
    // more than a slot's width to the side of the middle slot and less than a pocket's, and starts nothing now.
    expect(then.gates).toEqual([2, 1]);
    const through = events.flatMap((event) => (event.type === 'checker' ? [event] : []));
    expect(through.map((event) => event.gate)).toEqual([2]);
    expect(through[0]).toMatchObject({ held: true, gold: false });
    expect([back.credits, back.wasted, back.paidOut]).toEqual([then.credits, then.wasted, then.paidOut]);
    // So it has one medal fewer through a slot than that game had through a pocket, and holds one spin fewer.
    expect([back.hits, back.stock, back.spins]).toEqual([then.hits - 1, then.stock - 1, then.spins]);
    expect(back.machine.medals).toHaveLength(then.medals);
    expect([back.machine.rolling.length, back.machine.falling.length]).toEqual([then.rolling, then.falling]);
    // And each of them lies where that game's machine left it.
    expect(then.resting).toHaveLength(5);
    for (const rest of then.resting) {
      const medal = back.machine.medals.find((m) => m.id === rest.id);
      expect(medal).toMatchObject({ level: rest.level, tier: rest.tier });
      expect(medal?.x).toBeCloseTo(rest.x, 6);
      expect(medal?.y).toBeCloseTo(rest.y, 6);
    }
    // One thing is not as it was, and nothing on the tables hangs on it: that game's right arm went back to a
    // resting place once its rail was empty, and this one stays on its aim.
    expect(then.tips[1]).toBeGreaterThan(ARM_REACH[1].min);
    expect(back.machine.tips).toEqual([then.tips[0], ARM_REACH[1].min]);
  });

  it('takes a medal into either rail once the one slot it had would have been free, and into both at once', () => {
    const back = restore(OLD, 5) as Session;
    const wait = old().machine.cooldown as number;
    const before = back.inserted;
    expect(insert(back, 0)).toBe(false);
    expect(insert(back, 1)).toBe(false);
    for (let i = 0; i < Math.ceil(wait / DT); i++) advance(back, DT);
    expect(insert(back, 0)).toBe(true);
    expect(insert(back, 1)).toBe(true);
    expect(back.inserted).toBe(before + 2);
    // The first of the five it was saved with has left its rail by then. With the six that are on them it still reads,
    // and the two arms can be pointed apart from here on.
    expect(back.machine.rolling).toHaveLength(6);
    expect(restore(serialize(back), 1)).not.toBeNull();
    aimBoth(back.machine, 50);
    for (let i = 0; i < 300; i++) {
      if (back.credits === 0) refill(back);
      if (i % 11 === 0) for (const arm of [0, 1] as const) insert(back, arm);
      if (i === 100) back.machine.aims = [20, 80];
      advance(back, DT);
      if (i % 60 === 0) expect(restore(serialize(back), 1)).not.toBeNull();
    }
    expect(back.machine.tips).toEqual([20, 80]);
    expect(back.inserted).toBeGreaterThan(before + 40);
    expect(back.credits).toBe(START_CREDITS * (1 + back.refills) - back.inserted + back.won);
    expect(everyPosition(back).every(Number.isFinite)).toBe(true);
    expect(plain(reread(back))).toEqual(plain(back));
  });

  // That version's field is held to that version's shape and to its one slot's pace.
  const spoilt: [string, (save: Save) => void][] = [
    ['called a save of this version', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of the version before the arms', (save) => (save.version = VERSION_BEFORE_ARMS)],
    ['given an aim for each arm beside its one', (save) => (save.machine.aims = [39, 40])],
    ['given an aim for each arm in place of its one', (save) => Object.assign(save.machine, { aims: [39, 40], aim: undefined })],
    ['given a wait for each slot beside its one', (save) => (save.machine.waits = [0, 0])],
    ['left without its aim', (save) => delete save.machine.aim],
    ['left without its wait', (save) => delete save.machine.cooldown],
    ['pointed outside the field', (save) => (save.machine.aim = AIM.max + 1)],
    ['with its tips past each other', (save) => (save.machine.tips as number[]).reverse()],
    // Today the two rails keep their own pace. Then one slot fed both, and a save of then is held to that.
    ['with medals on the two rails closer together than its one slot fed them', (save) => (save.machine.rolling[3].remaining = (save.machine.rolling[2].remaining as number) + 0.1)],
    ['with a medal only just fed and its slot done waiting', (save) => (save.machine.cooldown = 0)],
  ];

  it.each(spoilt)('is refused when it is %s', (_name, spoil) => {
    const save = old();
    spoil(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });
});

describe('a screen that has been damaged', () => {
  // Each of these is written by hand, at a moment the machine does pass through.
  const SPIN = { result: { tier: 'small', digits: [4, 4, 4], reach: true, reachKind: 'normal' }, elapsed: 0.5, duration: TIMING.spin + TIMING.reach, done: false };
  const MISS = { tier: 'miss', digits: [5, 5, 6], reach: false, reachKind: 'none' };
  const SUGOROKU = { kind: 'sugoroku', roll: 3, from: 0, elapsed: 0.4, duration: sugorokuDuration(3), payout: -1 };
  const CHEST = { kind: 'chest', prizes: [20, 10, 30], fallback: 2, picked: -1, elapsed: 1, pickedAt: -1, told: false, payout: -1 };
  const PICKED = { ...CHEST, picked: 0, pickedAt: 0.5, told: true, elapsed: 3, payout: 20 };
  const TURN = { pocket: 1, from: 0, elapsed: 0.2, duration: 2.8, landed: false, level: 0, total: 0, gain: 0, over: false, jackpot: false, bowl: null };
  const ENDED = { ...TURN, elapsed: 3, landed: true, over: true, pocket: 0, from: 2, level: 2, total: 30 };
  // A full run of 10, 20, 30 and 10, and the ball two seconds into the top bowl, on its way to that bowl's own hole.
  const ROLLING = { holes: [...FALLS[TO_TOP]], stage: 0, elapsed: 2, duration: BOWL_TIMES[0], payout: -1 };
  // The same ball lower down: fallen into the middle bowl on its way to the jackpot, and at the bottom of the last with the jackpot paid.
  const LOWER = { holes: [...FALLS[TO_JACKPOT]], stage: 1, elapsed: 0.3, duration: BOWL_TIMES[1], payout: -1 };
  const WON = { holes: [...FALLS[TO_JACKPOT]], stage: 2, elapsed: BOWL_TIMES[2] + 1, duration: BOWL_TIMES[2], payout: JACKPOT_START };
  const BOWLED = { ...TURN, pocket: 5, from: 3, elapsed: TIMING.roulette + TIMING.step, landed: true, level: 4, total: 70, bowl: ROLLING };

  const withScreen = (screen: Row): Session | null => restore(damaged((save) => (save.screen = screen)), 1);
  const untouched = plain(reread(restore(GOOD, 1) as Session));

  it('keeps what is in order', () => {
    expect(CHAIN_GOAL).toBe(BOWLED.level);
    expect([...CHESTS].sort()).toEqual([...CHEST.prizes].sort());
    expect(ROULETTE[ENDED.from]).toBe(20);
    expect([ROULETTE[BOWLED.from], ROULETTE[BOWLED.pocket]]).toEqual([30, 10]);
    expect(withScreen({ spin: SPIN, bonus: null, roulette: null })?.spin).toEqual(SPIN);
    expect(withScreen({ spin: { ...SPIN, result: MISS, duration: TIMING.spin }, bonus: null, roulette: null })?.spin?.result).toEqual(MISS);
    expect(withScreen({ spin: null, bonus: SUGOROKU, roulette: null })?.bonus).toEqual(SUGOROKU);
    expect(withScreen({ spin: null, bonus: CHEST, roulette: null })?.bonus).toEqual(CHEST);
    expect(withScreen({ spin: null, bonus: PICKED, roulette: null })?.bonus).toEqual(PICKED);
    const run = withScreen({ spin: null, bonus: null, roulette: TURN });
    expect(run?.roulette).toEqual(TURN);
    expect(run?.balls).toBe(0);
    expect(run?.roulettes).toBe(3);
    expect(withScreen({ spin: null, bonus: null, roulette: ENDED })?.roulette).toEqual(ENDED);
    expect(withScreen({ spin: null, bonus: null, roulette: BOWLED })?.roulette).toEqual(BOWLED);
    expect(withScreen({ spin: null, bonus: null, roulette: { ...BOWLED, bowl: LOWER } })?.roulette).toEqual({ ...BOWLED, bowl: LOWER });
    const won = { ...BOWLED, over: true, jackpot: true, gain: JACKPOT_START, total: BOWLED.total + JACKPOT_START, bowl: WON };
    expect(withScreen({ spin: null, bonus: null, roulette: won })?.roulette).toEqual(won);
  });

  const spins: [string, unknown][] = [
    ['a spin that is a number', 5],
    ['a spin that is a list', []],
    ['a spin with no result', { ...SPIN, result: null }],
    ['a spin of a tier the slot does not have', { ...SPIN, result: { ...SPIN.result, tier: 'jackpot' } }],
    ['a reel showing a digit it does not have', { ...SPIN, duration: TIMING.spin, result: { ...MISS, digits: [0, 1, 2] } }],
    ['a reel showing ten', { ...SPIN, duration: TIMING.spin, result: { ...MISS, digits: [10, 1, 2] } }],
    ['two reels', { ...SPIN, result: { ...SPIN.result, digits: [4, 4] } }],
    ['four reels', { ...SPIN, result: { ...SPIN.result, digits: [4, 4, 4, 4] } }],
    ['a winning tier without a line', { ...SPIN, result: { ...SPIN.result, digits: [4, 6, 4] } }],
    ['a line of another tier', { ...SPIN, result: { ...SPIN.result, tier: 'seven', digits: [3, 3, 3] } }],
    ['a miss that is a line', { ...SPIN, result: { ...SPIN.result, tier: 'miss', digits: [7, 7, 7] } }],
    ['a reach that is a number', { ...SPIN, result: { ...SPIN.result, reach: 1 } }],
    ['a reach played a way the slot does not have', { ...SPIN, result: { ...SPIN.result, reachKind: 'super' } }],
    ['a reach with no word on how it is played', { ...SPIN, result: { tier: 'small', digits: [4, 4, 4], reach: true } }],
    ['a spin that takes no time', { ...SPIN, duration: 0 }],
    ['a spin that takes for ever', { ...SPIN, duration: 1e9 }],
    ['a spin that began before it began', { ...SPIN, elapsed: -1 }],
    ['a spin whose clock is not a number', { ...SPIN, elapsed: null }],
    ['a spin that is neither done nor not', { ...SPIN, done: 'yes' }],
    ['a spin with a field too many', { ...SPIN, kind: 'spin' }],
    ['a spin with a field missing', { result: SPIN.result, elapsed: 0.5, duration: SPIN.duration }],
  ];

  it.each(spins)('leaves off %s and keeps the machine', (_name, spin) => {
    const back = withScreen({ spin, bonus: null, roulette: null });
    expect(back).not.toBeNull();
    expect(plain(back as Session)).toEqual(untouched);
  });

  const bonuses: [string, unknown][] = [
    ['a bonus that is text', 'chest'],
    ['a game the machine does not have', { ...SUGOROKU, kind: 'dice' }],
    ['a die showing nothing', { ...SUGOROKU, roll: 0 }],
    ['a die showing seven', { ...SUGOROKU, roll: 7 }],
    ['a piece setting off from off the board', { ...SUGOROKU, from: BOARD.length }],
    ['a roll that takes no time', { ...SUGOROKU, duration: 0 }],
    ['a square that paid less than nothing', { ...SUGOROKU, payout: -2 }],
    ['chests holding the same prize twice', { ...CHEST, prizes: [10, 10, 30] }],
    ['two chests', { ...CHEST, prizes: [10, 20] }],
    ['four chests', { ...CHEST, prizes: [10, 20, 30, 30] }],
    ['chests holding prizes of their own', { ...CHEST, prizes: [100, 200, 300] }],
    ['chests that are not a list', { ...CHEST, prizes: null }],
    ['a clock picking a fourth chest', { ...CHEST, fallback: 3 }],
    ['a fourth chest picked', { ...PICKED, picked: 3 }],
    ['a chest paid before one was picked', { ...CHEST, payout: 20 }],
    ['a chest told before one was picked', { ...CHEST, told: true }],
    ['a chest picked at no time', { ...PICKED, pickedAt: -1 }],
    ['a chest picked later than now', { ...PICKED, pickedAt: 4 }],
    ['a chest that paid what another holds', { ...PICKED, payout: 30 }],
    ['a chest clock past a minute', { ...CHEST, elapsed: LIMITS.timer + 1 }],
    ['a chest with a field of the board game', { ...CHEST, roll: 3 }],
  ];

  it.each(bonuses)('leaves off %s and keeps the machine', (_name, bonus) => {
    const back = withScreen({ spin: null, bonus, roulette: null });
    expect(back).not.toBeNull();
    expect(plain(back as Session)).toEqual(untouched);
  });

  const roulettes: [string, unknown][] = [
    ['a roulette that is a number', 5],
    ['a roulette that is true', true],
    ['a pocket past the last', { ...TURN, pocket: ROULETTE.length }],
    ['a pocket before the first', { ...TURN, from: -1 }],
    ['a pocket between two', { ...TURN, pocket: 1.5 }],
    ['a turn that takes no time', { ...TURN, duration: 0 }],
    ['a turn whose time is not a number', { ...TURN, duration: Number.NaN }],
    ['a run past its goal', { ...TURN, level: CHAIN_GOAL + 1 }],
    ['a run of fewer than no numbers', { ...TURN, level: -1 }],
    ['a run that has paid less than nothing', { ...TURN, total: -10 }],
    ['a pocket that paid an absurd amount', { ...TURN, gain: LIMITS.purse + 1 }],
    ['a run that ended before the light stopped', { ...TURN, over: true }],
    ['a jackpot in a run that has not ended', { ...TURN, landed: true, jackpot: true }],
    ['a roulette with a field missing', { pocket: 1, from: 0 }],
    ['a roulette with a field too many', { ...TURN, lamp: 3 }],
    ['a bowl that is a number', { ...TURN, bowl: 3 }],
    ['a bowl that is a list', { ...BOWLED, bowl: [] }],
    ['a hole the bowl does not have', { ...BOWLED, bowl: { ...ROLLING, holes: [BOWLS[0].length] } }],
    ['a hole before the first', { ...BOWLED, bowl: { ...ROLLING, holes: [-1] } }],
    ['a hole between two', { ...BOWLED, bowl: { ...ROLLING, holes: [1.5] } }],
    ['a way down that is one hole and not a list', { ...BOWLED, bowl: { ...ROLLING, holes: 2 } }],
    ['no way down at all', { ...BOWLED, bowl: { ...ROLLING, holes: [] } }],
    ['a way down that stops at a hole that leads on', { ...BOWLED, bowl: { ...ROLLING, holes: [0] } }],
    ['a way down that goes on from a hole that pays', { ...BOWLED, bowl: { ...ROLLING, holes: [2, 0] } }],
    ['a way down through more bowls than there are', { ...BOWLED, bowl: { ...LOWER, holes: [0, 0, 0, 0] } }],
    ['a way down to a second hole the last bowl does not have', { ...BOWLED, bowl: { ...LOWER, holes: [0, 0, 1] } }],
    ['a ball in a bowl past the end of its way', { ...BOWLED, bowl: { ...ROLLING, stage: 1, duration: BOWL_TIMES[1] } }],
    ['a ball in a fourth bowl', { ...BOWLED, bowl: { ...LOWER, stage: BOWLS.length } }],
    ['a ball in a bowl above the first', { ...BOWLED, bowl: { ...LOWER, stage: -1 } }],
    ['a ball in the middle bowl on the top bowl’s clock', { ...BOWLED, bowl: { ...LOWER, duration: BOWL_TIMES[0] } }],
    ['a ball that rolls for no time', { ...BOWLED, bowl: { ...ROLLING, duration: 0 } }],
    ['a ball let go before it was let go', { ...BOWLED, bowl: { ...ROLLING, elapsed: -1 } }],
    ['a hole that paid less than nothing', { ...BOWLED, bowl: { ...ROLLING, payout: -2 } }],
    ['a hole that only leads down and paid', { ...BOWLED, bowl: { ...LOWER, payout: 0 } }],
    ['a bowl with a field missing', { ...BOWLED, bowl: { holes: [...FALLS[TO_TOP]], elapsed: 2, duration: BOWL_TIMES[0], payout: -1 } }],
    ['a bowl with a field too many', { ...BOWLED, bowl: { ...ROLLING, spin: 3 } }],
    ['the one bowl of the versions before, under this version’s number', { ...BOWLED, bowl: { hole: 1, elapsed: 2, duration: TIMING.bowl, payout: -1 } }],
  ];

  it.each(roulettes)('leaves off %s, keeps the machine and gives the ball back', (_name, roulette) => {
    const back = withScreen({ spin: null, bonus: null, roulette });
    expect(back).not.toBeNull();
    expect(plain(back as Session)).toEqual({ ...untouched, balls: 1, roulettes: 2 });
  });

  it('leaves everything off when more than one thing is on, and still gives the ball back', () => {
    expect(plain(withScreen({ spin: SPIN, bonus: CHEST, roulette: null }) as Session)).toEqual(untouched);
    expect(plain(withScreen({ spin: SPIN, bonus: null, roulette: TURN }) as Session)).toEqual({ ...untouched, balls: 1, roulettes: 2 });
    expect(plain(withScreen({ spin: SPIN, bonus: SUGOROKU, roulette: ENDED }) as Session)).toEqual({ ...untouched, balls: 1, roulettes: 2 });
    expect(plain(withScreen({ spin: null, bonus: CHEST, roulette: BOWLED }) as Session)).toEqual({ ...untouched, balls: 1, roulettes: 2 });
  });

  it('takes a screen with nothing written on it as an empty one', () => {
    expect(plain(withScreen({}) as Session)).toEqual(untouched);
    expect(plain(withScreen({ spin: null, reels: [1, 2, 3] }) as Session)).toEqual(untouched);
  });

  it('never gives back more balls than a machine holds, nor counts a roulette that was never started', () => {
    const text = damaged((save) => {
      save.session.balls = LIMITS.balls;
      save.session.roulettes = 0;
      save.screen.roulette = 'spinning';
    });
    const back = restore(text, 1);
    expect(back?.balls).toBe(LIMITS.balls);
    expect(back?.roulettes).toBe(0);
    expect(restore(serialize(back as Session), 1)).not.toBeNull();
  });
});

// ── The phases of the screen ────────────────────────────────────────────────

/**
 * Saves taken from real sessions, one at each phase the screen passes through
 * (the phases are listed above each check in storage.ts).
 */
const PHASES = (() => {
  const caught: Record<string, string> = {};
  /** Runs a session until `when` holds, and keeps the save it is caught at. */
  const until = (session: Session, name: string, when: () => boolean): void => {
    for (let i = 0; i < 60 * 60 && !when(); i++) advance(session, DT);
    if (!when()) throw new Error(`the session never came to ${name}`);
    caught[name] = serialize(session);
  };
  const chest = (session: Session) => (session.bonus?.kind === 'chest' ? session.bonus : null);
  const board = (session: Session) => (session.bonus?.kind === 'sugoroku' ? session.bonus : null);
  const reels = (session: Session) => (session.spin?.elapsed ?? 0) > 0.5;

  // A spin that misses with no reach.
  let session = quiet();
  session.stock = 1;
  script(session, [0.99]);
  until(session, 'a spin that will miss', () => reels(session));

  // A reach that misses: the usual one, and the long one.
  session = quiet();
  session.stock = 1;
  script(session, [0.99, 0.5, 0.1, 0.2, 0.9]);
  until(session, 'a reach that will miss', () => reels(session));
  session = quiet();
  session.stock = 1;
  script(session, [0.99, 0.5, 0.1, 0.2, 0.1]);
  until(session, 'a long reach that will miss', () => reels(session));

  // 2·2·2 with the usual reach, and the roll on the board it leads to.
  session = quiet();
  session.stock = 1;
  script(session, [0.03, 0, 0.9]);
  until(session, 'a spin that will win', () => reels(session));
  until(session, 'a line held up', () => session.spin?.done === true);
  until(session, 'a piece on its way', () => (board(session)?.elapsed ?? 0) > 0.5);
  until(session, 'a square that has paid', () => (board(session)?.payout ?? -1) >= 0);

  // 2·2·2 with the long reach.
  session = quiet();
  session.stock = 1;
  script(session, [0.03, 0, 0.1]);
  until(session, 'a long reach that will win', () => reels(session));

  // 1·1·1 and the chests, left to the clock.
  session = quiet();
  session.stock = 1;
  script(session, [0.01, 0]);
  until(session, 'chests to choose from', () => (chest(session)?.elapsed ?? 0) > 1);
  until(session, 'a chest the clock picked', () => (chest(session)?.picked ?? -1) >= 0);
  until(session, 'a chest the clock picked, open', () => (chest(session)?.payout ?? -1) >= 0);

  // The same chests, with the player picking one the clock would not have.
  session = quiet();
  session.stock = 1;
  script(session, [0.01, 0]);
  until(session, 'chests to choose from', () => (chest(session)?.elapsed ?? 0) > 1);
  pickChest(session, ((chest(session)?.fallback ?? 0) + 1) % CHESTS.length);
  until(session, 'a chest just picked', () => true);
  advance(session, DT);
  until(session, 'a chest picked', () => chest(session)?.told === true);
  until(session, 'a chest open', () => (chest(session)?.payout ?? -1) >= 0);

  // A ball's roulette: 10, 20 and a cross.
  session = quiet();
  session.balls = 1;
  script(session, [pocketRoll(1), pocketRoll(2), pocketRoll(0)]);
  until(session, 'the first turn', () => (session.roulette?.elapsed ?? 0) > 0.5);
  until(session, 'a number', () => session.roulette?.landed === true);
  until(session, 'a second turn', () => session.roulette?.level === 1 && !session.roulette.landed && session.roulette.elapsed > 0.5);
  until(session, 'a second number', () => session.roulette?.level === 2 && session.roulette.landed);
  until(session, 'a third turn', () => session.roulette?.level === 2 && !session.roulette.landed && session.roulette.elapsed > 0.5);
  until(session, 'a cross', () => session.roulette?.over === true);

  // A cross straight away.
  session = quiet();
  session.balls = 1;
  script(session, [pocketRoll(0)]);
  until(session, 'a cross on the first turn', () => session.roulette?.over === true);

  // A full run, and the ball down all three bowls into the jackpot's hole.
  session = quiet();
  session.balls = 1;
  script(session, [...FULL_RUN.map(pocketRoll), fallRoll(TO_JACKPOT)]);
  const ball = () => session.roulette?.bowl ?? null;
  until(session, 'the last number', () => session.roulette?.level === CHAIN_GOAL && session.roulette.bowl === null);
  until(session, 'the ball rolling', () => (ball()?.elapsed ?? 0) > 0.5);
  until(session, 'the ball through a hole', () => ball()?.stage === 1);
  until(session, 'the ball in the middle bowl', () => ball()?.stage === 1 && (ball()?.elapsed ?? 0) > 2);
  until(session, 'the ball in the last bowl', () => ball()?.stage === 2 && (ball()?.elapsed ?? 0) > 1);
  until(session, 'the ball in the jackpot', () => (ball()?.payout ?? -1) >= 0);
  until(session, 'the jackpot counted out', () => (ball()?.elapsed ?? 0) > BOWL_TIMES[2] + bowlShowTime(false) + 1);

  // The same run, and the ball into a hole that holds medals: the middle bowl's.
  session = quiet();
  session.balls = 1;
  script(session, [...FULL_RUN.map(pocketRoll), fallRoll(TO_MIDDLE)]);
  until(session, 'the ball in a hole', () => (ball()?.payout ?? -1) >= 0);

  // And into the top bowl's own hole, which is as far as that ball goes.
  session = quiet();
  session.balls = 1;
  script(session, [...FULL_RUN.map(pocketRoll), fallRoll(TO_TOP)]);
  until(session, 'the ball in the top bowl’s hole', () => (ball()?.payout ?? -1) >= 0);
  return caught;
})();

/** The one thing on the screen of a save, whichever it is. */
const onScreen = (save: Save): { place: string; thing: Row } => {
  const places = ['spin', 'bonus', 'roulette'].filter((place) => save.screen[place] !== null);
  if (places.length !== 1) throw new Error('the save has not exactly one thing on its screen');
  return { place: places[0], thing: save.screen[places[0]] as Row };
};

/** What a save should come back as when its screen is left off: the machine and its books, and the ball if a roulette went. */
const leftOff = (save: Save) => {
  const bare = restore(JSON.stringify({ ...save, screen: { spin: null, bonus: null, roulette: null } }), 1);
  if (!bare) throw new Error('the machine under the screen does not read');
  if (save.screen.roulette === null) return plain(bare);
  return { ...plain(bare), balls: bare.balls + 1, roulettes: bare.roulettes - 1 };
};

/** What the numbers of a full run come to. */
const RUN_PAID = FULL_RUN.reduce((sum, pocket) => sum + (ROULETTE[pocket] as number), 0);

describe('a screen caught at each of its phases', () => {
  it.each(Object.keys(PHASES))('comes back as it was: %s', (name) => {
    const back = restore(PHASES[name], 1);
    expect(back).not.toBeNull();
    expect(serialize(back as Session)).toBe(PHASES[name]);
    expect([back?.spin, back?.bonus, back?.roulette].filter((thing) => thing !== null)).toHaveLength(1);
  });

  it('is the phase its name says', () => {
    const at = (name: string) => JSON.parse(PHASES[name]) as Save;
    expect(Object.keys(PHASES)).toHaveLength(30);
    expect(at('a spin that will miss').screen.spin).toMatchObject({ done: false, duration: TIMING.spin, result: { tier: 'miss', reach: false, reachKind: 'none' } });
    expect(at('a reach that will miss').screen.spin).toMatchObject({ done: false, duration: TIMING.spin + TIMING.reach, result: { tier: 'miss', reach: true, reachKind: 'normal' } });
    expect(at('a long reach that will miss').screen.spin).toMatchObject({ done: false, result: { tier: 'miss', reach: true, reachKind: 'long' } });
    expect(at('a spin that will win').screen.spin).toMatchObject({ done: false, duration: TIMING.spin + TIMING.reach, result: { tier: 'small', reach: true, reachKind: 'normal' } });
    expect(at('a long reach that will win').screen.spin).toMatchObject({ done: false, result: { tier: 'small', reach: true, reachKind: 'long' } });
    expect((at('a long reach that will win').screen.spin as Row).duration).toBe(TIMING.spin + (TIMING.reach + TIMING.longReach));
    expect(at('a line held up').screen.spin).toMatchObject({ done: true });
    expect(at('a piece on its way').screen.bonus).toMatchObject({ kind: 'sugoroku', payout: -1 });
    expect(at('a square that has paid').screen.bonus).toMatchObject({ kind: 'sugoroku', payout: BOARD[4] });
    expect(at('a square that has paid').session.square).toBe(4);
    expect(at('chests to choose from').screen.bonus).toMatchObject({ kind: 'chest', picked: -1, told: false, payout: -1 });
    const clock = at('a chest the clock picked').screen.bonus as Row;
    expect(clock).toMatchObject({ picked: clock.fallback, told: true, payout: -1 });
    expect(clock.pickedAt).toBeGreaterThanOrEqual(TIMING.choose);
    expect((at('a chest the clock picked, open').screen.bonus as Row).payout).toBeGreaterThan(0);
    const justPicked = at('a chest just picked').screen.bonus as Row;
    expect(justPicked).toMatchObject({ told: false, payout: -1, pickedAt: justPicked.elapsed });
    expect(justPicked.picked).not.toBe(justPicked.fallback);
    expect(at('a chest picked').screen.bonus).toMatchObject({ told: true, payout: -1 });
    expect((at('a chest open').screen.bonus as Row).payout).toBeGreaterThan(0);
    expect(at('the first turn').screen.roulette).toMatchObject({ landed: false, level: 0, total: 0, from: 0, bowl: null });
    expect(at('a number').screen.roulette).toMatchObject({ landed: true, over: false, level: 1, gain: 10, total: 10, bowl: null });
    expect(at('a second turn').screen.roulette).toMatchObject({ landed: false, level: 1, gain: 0, total: 10, from: 1 });
    expect(at('a second number').screen.roulette).toMatchObject({ landed: true, over: false, level: 2, gain: 20, total: 30 });
    expect(at('a third turn').screen.roulette).toMatchObject({ landed: false, level: 2, total: 30, from: 2 });
    expect(at('a cross').screen.roulette).toMatchObject({ landed: true, over: true, jackpot: false, level: 2, gain: 0, total: 30, bowl: null });
    expect(at('a cross on the first turn').screen.roulette).toMatchObject({ landed: true, over: true, level: 0, total: 0, from: 0 });
    expect(at('the last number').screen.roulette).toMatchObject({ landed: true, over: false, jackpot: false, level: CHAIN_GOAL, total: RUN_PAID, bowl: null });
    expect(at('the ball rolling').screen.roulette).toMatchObject({ landed: true, over: false, jackpot: false, level: CHAIN_GOAL, gain: 0, total: RUN_PAID });
    // The ball's way down is written from the moment it is let go, and the bowl it has got to on it.
    const way = [...FALLS[TO_JACKPOT]];
    expect(way).toHaveLength(BOWLS.length);
    expect(at('the ball rolling').screen.roulette).toMatchObject({ bowl: { holes: way, stage: 0, duration: BOWL_TIMES[0], payout: -1 } });
    // Through a hole it is in the bowl below in that very step, its clock at nothing, and the run is as it was.
    expect(at('the ball through a hole').screen.roulette).toMatchObject({ over: false, jackpot: false, gain: 0, total: RUN_PAID });
    expect(at('the ball through a hole').screen.roulette).toMatchObject({ bowl: { holes: way, stage: 1, elapsed: 0, duration: BOWL_TIMES[1], payout: -1 } });
    expect(at('the ball in the middle bowl').screen.roulette).toMatchObject({ gain: 0, bowl: { holes: way, stage: 1, duration: BOWL_TIMES[1], payout: -1 } });
    expect(at('the ball in the last bowl').screen.roulette).toMatchObject({ over: false, gain: 0, bowl: { holes: way, stage: 2, duration: BOWL_TIMES[2], payout: -1 } });
    expect(at('the ball in the jackpot').screen.roulette).toMatchObject({ over: true, jackpot: true, gain: JACKPOT_START, total: RUN_PAID + JACKPOT_START });
    expect(at('the ball in the jackpot').screen.roulette).toMatchObject({ bowl: { holes: way, stage: 2, duration: BOWL_TIMES[2], payout: JACKPOT_START } });
    expect(at('the ball in the jackpot').session.jackpots).toBe(1);
    // The jackpot is still up when a prize from an upper bowl would have gone.
    const counted = (at('the jackpot counted out').screen.roulette as Row).bowl as Row;
    expect(counted).toMatchObject({ holes: way, stage: 2, payout: JACKPOT_START });
    expect(counted.elapsed).toBeGreaterThan(BOWL_TIMES[2] + bowlShowTime(false));
    expect(counted.elapsed).toBeLessThan(BOWL_TIMES[2] + bowlShowTime(true));
    expect(at('the ball in a hole').screen.roulette).toMatchObject({ over: true, jackpot: false, gain: MIDDLE_PRIZE, total: RUN_PAID + MIDDLE_PRIZE });
    expect(at('the ball in a hole').screen.roulette).toMatchObject({ bowl: { holes: [...FALLS[TO_MIDDLE]], stage: 1, duration: BOWL_TIMES[1], payout: MIDDLE_PRIZE } });
    expect(at('the ball in the top bowl’s hole').screen.roulette).toMatchObject({ over: true, jackpot: false, gain: TOP_PRIZE, total: RUN_PAID + TOP_PRIZE });
    expect(at('the ball in the top bowl’s hole').screen.roulette).toMatchObject({ bowl: { holes: [...FALLS[TO_TOP]], stage: 0, duration: BOWL_TIMES[0], payout: TOP_PRIZE } });
    expect([MIDDLE_PRIZE, TOP_PRIZE]).toEqual([100, 50]);
  });

  // One field of a good save changed, into something the machine never passes through.
  const other = (chest: Row): number => ((chest.picked as number) + 1) % CHESTS.length;
  const result = (spin: Row): Row => spin.result as Row;
  const bowl = (run: Row): Row => run.bowl as Row;
  /** A ball only just let go into the top bowl. */
  const letGo = (): Row => ({ holes: [...FALLS[TO_TOP]], stage: 0, elapsed: 0, duration: BOWL_TIMES[0], payout: -1 });
  const impossible: [string, string, (thing: Row, save: Save) => void][] = [
    // A spin
    ['a spin that will win', 'is done before its reels have stopped', (spin) => (spin.done = true)],
    ['a spin that will win', 'is still running at the moment its reels stop', (spin) => (spin.elapsed = spin.duration)],
    ['a spin that will win', 'runs for a time the machine gives no spin', (spin) => (spin.duration = 2)],
    ['a spin that will win', 'runs for the time of a spin with no reach', (spin) => (spin.duration = TIMING.spin)],
    ['a spin that will win', 'has no reach, its outer reels alike', (spin) => (result(spin).reach = false)],
    ['a spin that will win', 'has a reach that is played no way at all', (spin) => (result(spin).reachKind = 'none')],
    ['a spin that will win', 'has a long reach in the time of the usual one', (spin) => (result(spin).reachKind = 'long')],
    ['a long reach that will win', 'has the usual reach in the time of a long one', (spin) => (result(spin).reachKind = 'normal')],
    ['a long reach that will win', 'runs for the time of the usual reach', (spin) => (spin.duration = TIMING.spin + TIMING.reach)],
    ['a long reach that will miss', 'runs for the time of the usual reach', (spin) => (spin.duration = TIMING.spin + TIMING.reach)],
    ['a reach that will miss', 'runs for the time of a long reach', (spin) => (spin.duration = TIMING.spin + (TIMING.reach + TIMING.longReach))],
    ['a reach that will miss', 'has a reach that is played no way at all', (spin) => (result(spin).reachKind = 'none')],
    ['a reach that will miss', 'is done', (spin) => (spin.done = true)],
    ['a spin that will miss', 'has a reach, its outer reels apart', (spin) => (result(spin).reach = true)],
    ['a spin that will miss', 'has a way of playing a reach it does not have', (spin) => (result(spin).reachKind = 'normal')],
    ['a spin that will miss', 'is done', (spin) => (spin.done = true)],
    ['a spin that will miss', 'has stopped and is still on the screen', (spin) => (spin.elapsed = spin.duration)],
    ['a line held up', 'is not done, its reels long stopped', (spin) => (spin.done = false)],
    ['a line held up', 'is done before its reels stopped', (spin) => (spin.elapsed = 0.1)],
    ['a line held up', 'is held up past its time', (spin) => (spin.elapsed = (spin.duration as number) + TIMING.celebrate)],

    // A roll on the board
    ['a piece on its way', 'has paid before it landed', (roll) => (roll.payout = BOARD[squareAfter(roll.from as number, roll.roll as number)])],
    ['a piece on its way', 'has landed and not paid', (roll) => (roll.elapsed = roll.duration)],
    ['a piece on its way', 'takes longer than its hops', (roll) => (roll.duration = (roll.duration as number) + TIMING.hop)],
    ['a piece on its way', 'rolled another number in the same time', (roll) => (roll.roll = (roll.roll as number) + 1)],
    ['a piece on its way', 'set off from a square it was not on', (roll) => (roll.from = 5)],
    ['a piece on its way', 'is on the board while the session has it elsewhere', (_roll, save) => (save.session.square = 5)],
    ['a square that has paid', 'is unpaid again', (roll) => (roll.payout = -1)],
    ['a square that has paid', 'paid what another square holds', (roll) => (roll.payout = (roll.payout as number) + 1)],
    ['a square that has paid', 'is shown past its time', (roll) => (roll.elapsed = (roll.duration as number) + TIMING.prize)],
    ['a square that has paid', 'is back before it landed', (roll) => (roll.elapsed = 0.1)],
    ['a square that has paid', 'has left the session with the piece where it set off', (roll, save) => (save.session.square = roll.from)],

    // A choice of chests
    ['chests to choose from', 'are still waiting when the time to choose is up', (chest) => (chest.elapsed = TIMING.choose)],
    ['chests to choose from', 'are waiting on a machine that picks at once', (_chest, save) => (save.session.quickPick = true)],
    ['chests to choose from', 'have a pick time and no pick', (chest) => (chest.pickedAt = 0.5)],
    ['chests to choose from', 'are told of a pick that was not made', (chest) => (chest.told = true)],
    ['chests to choose from', 'have paid with none picked', (chest) => (chest.payout = 10)],
    ['a chest just picked', 'was picked a while ago and never taken in', (chest) => (chest.elapsed = (chest.elapsed as number) + 0.5)],
    ['a chest just picked', 'has paid already', (chest) => (chest.payout = (chest.prizes as number[])[chest.picked as number])],
    ['a chest just picked', 'was picked after now', (chest) => (chest.pickedAt = (chest.pickedAt as number) + 0.5)],
    ['a chest picked', 'has not been taken in', (chest) => (chest.told = false)],
    ['a chest picked', 'has paid before it opened', (chest) => (chest.payout = (chest.prizes as number[])[chest.picked as number])],
    ['a chest picked', 'is still shut at the moment it opens', (chest) => (chest.elapsed = (chest.pickedAt as number) + TIMING.open)],
    ['a chest picked', 'is no longer picked', (chest) => (chest.picked = -1)],
    ['a chest picked', 'was picked after now', (chest) => (chest.pickedAt = (chest.elapsed as number) + 0.5)],
    ['a chest open', 'is unpaid again', (chest) => (chest.payout = -1)],
    ['a chest open', 'paid what another chest holds', (chest) => (chest.payout = (chest.prizes as number[])[other(chest)])],
    ['a chest open', 'is open past its time', (chest) => (chest.elapsed = (chest.pickedAt as number) + TIMING.open + TIMING.prize)],
    ['a chest open', 'has not been taken in', (chest) => (chest.told = false)],
    ['a chest open', 'opened before its time', (chest) => (chest.elapsed = (chest.pickedAt as number) + 0.1)],
    ['a chest the clock picked', 'is not the chest the clock picks', (chest) => (chest.picked = other(chest))],
    ['a chest the clock picked', 'is no longer the chest the clock picks', (chest) => (chest.fallback = other(chest))],
    ['a chest the clock picked', 'has not been taken in', (chest) => (chest.told = false)],
    ['a chest the clock picked, open', 'is unpaid again', (chest) => (chest.payout = -1)],

    // A ball's roulette, turn by turn
    ['the first turn', 'has landed while the light is going round', (run) => (run.landed = true)],
    ['the first turn', 'is still turning at the moment the light stops', (run) => (run.elapsed = run.duration)],
    ['the first turn', 'takes a time the machine gives no turn', (run) => (run.duration = 3)],
    ['the first turn', 'has a gain before any pocket', (run) => (run.gain = 10)],
    ['the first turn', 'has medals before any number', (run) => (run.total = 10)],
    ['the first turn', 'has a number behind it already', (run) => (run.level = 1)],
    ['the first turn', 'set off from a pocket other than the first', (run) => (run.from = 1)],
    ['the first turn', 'is over', (run) => (run.over = true)],
    ['the first turn', 'is a jackpot', (run) => (run.jackpot = true)],
    ['the first turn', 'has a ball in the bowl already', (run) => (run.bowl = letGo())],
    ['a number', 'has not landed, its turn long done', (run) => (run.landed = false)],
    ['a number', 'has ended the run', (run) => (run.over = true)],
    ['a number', 'is a jackpot', (run) => (run.jackpot = true)],
    ['a number', 'landed before the light could have stopped', (run) => (run.elapsed = 0.5)],
    ['a number', 'has no gain', (run) => (run.gain = 0)],
    ['a number', 'has the gain of another pocket', (run) => (run.gain = 20)],
    ['a number', 'counts for nothing', (run) => (run.level = 0)],
    ['a number', 'counts as the last of a full run', (run) => (run.level = CHAIN_GOAL)],
    ['a number', 'has a total its number does not make', (run) => (run.total = 5)],
    ['a number', 'is overdue for the next turn', (run) => (run.elapsed = (run.duration as number) + TIMING.step)],
    ['a number', 'is on a cross', (run) => (run.pocket = 0)],
    ['a number', 'is on another number', (run) => (run.pocket = 2)],
    ['a number', 'has a ball in the bowl with the run not full', (run) => (run.bowl = letGo())],
    ['a second turn', 'has made a full run and is still turning', (run) => (run.level = CHAIN_GOAL)],
    ['a second turn', 'set off from a cross', (run) => (run.from = 0)],
    ['a second turn', 'set off from a number it did not land on', (run) => (run.from = 2)],
    ['a second turn', 'has a total no number makes', (run) => (run.total = 15)],
    ['a second turn', 'has more numbers than its total', (run) => (run.level = 3)],
    ['a second number', 'has a total short of its two numbers', (run) => (run.total = 20)],
    ['a second number', 'has a total past its two numbers', (run) => (run.total = 40)],
    ['a second number', 'set off from the first pocket', (run) => (run.from = 0)],
    ['a third turn', 'has a total its two numbers do not make', (run) => (run.total = 20)],
    ['a cross', 'has not ended the run', (run) => (run.over = false)],
    ['a cross', 'has not landed', (run) => (run.landed = false)],
    ['a cross', 'landed before the light could have stopped', (run) => (run.elapsed = 0.5)],
    ['a cross', 'has a gain', (run) => (run.gain = 10)],
    ['a cross', 'is a jackpot', (run) => (run.jackpot = true)],
    ['a cross', 'is shown past its time', (run) => (run.elapsed = (run.duration as number) + TIMING.prize)],
    ['a cross', 'has made a full run', (run) => (run.level = CHAIN_GOAL)],
    ['a cross', 'is on a number', (run) => (run.pocket = 1)],
    ['a cross on the first turn', 'has a number behind it', (run) => (run.level = 1)],

    // The end of a full run: the last number, and the ball in the bowls
    ['the last number', 'has not landed', (run) => (run.landed = false)],
    ['the last number', 'has ended the run', (run) => (run.over = true)],
    ['the last number', 'is a jackpot', (run) => (run.jackpot = true)],
    ['the last number', 'has kept the ball out of the bowl past its time', (run) => (run.elapsed = (run.duration as number) + TIMING.step)],
    ['the last number', 'has the ball in the bowl before its time', (run) => (run.bowl = letGo())],
    ['the last number', 'has a total its numbers do not make', (run) => (run.total = (run.total as number) + 5)],
    ['the ball rolling', 'has dropped while it is rolling', (run) => (bowl(run).payout = 50)],
    ['the ball rolling', 'is still rolling at the moment it drops', (run) => (bowl(run).elapsed = bowl(run).duration)],
    ['the ball rolling', 'rolls for a time the machine gives no ball', (run) => (bowl(run).duration = 5)],
    ['the ball rolling', 'rolls in the top bowl for the time of the middle one', (run) => (bowl(run).duration = BOWL_TIMES[1])],
    ['the ball rolling', 'is in the middle bowl on the top bowl’s clock', (run) => (bowl(run).stage = 1)],
    ['the ball rolling', 'is on a way down that stops at a hole that leads on', (run) => (bowl(run).holes = [0])],
    ['the ball rolling', 'is on a way down that goes on from a hole that pays', (run) => (bowl(run).holes = [2, 0, 0])],
    ['the ball rolling', 'is in the one bowl of the versions before', (run) => (run.bowl = { hole: 0, elapsed: bowl(run).elapsed, duration: TIMING.bowl, payout: -1 })],
    ['the ball rolling', 'is in a bowl whose run has ended', (run) => (run.over = true)],
    ['the ball rolling', 'is a jackpot before it has dropped', (run) => (run.jackpot = true)],
    ['the ball rolling', 'still shows the last number as its gain', (run) => (run.gain = ROULETTE[run.pocket as number])],
    ['the ball rolling', 'is in a bowl whose last number never landed', (run) => (run.landed = false)],
    ['the ball rolling', 'is in a bowl after a run one number short', (run) => (run.level = CHAIN_GOAL - 1)],
    ['the ball rolling', 'was let go before the last number had its time', (run) => (run.elapsed = run.duration)],
    ['the ball rolling', 'is in a bowl after a cross', (run) => (run.pocket = 0)],
    ['the ball rolling', 'has a total its numbers do not make', (run) => (run.total = (run.total as number) + 5)],
    ['the ball rolling', 'is in a bowl with no ball in it', (run) => (run.bowl = null)],
    ['the ball through a hole', 'was paid for a hole that only leads down', (run) => (bowl(run).payout = 0)],
    ['the ball through a hole', 'kept the clock of the bowl it left', (run) => (bowl(run).duration = BOWL_TIMES[0])],
    ['the ball through a hole', 'has ended the run on its way down', (run) => (run.over = true)],
    ['the ball in the middle bowl', 'is still rolling at the moment it drops', (run) => (bowl(run).elapsed = bowl(run).duration)],
    ['the ball in the middle bowl', 'is in a bowl after a run one number short', (run) => (run.level = CHAIN_GOAL - 1)],
    ['the ball in the last bowl', 'is in a fourth bowl', (run) => (bowl(run).stage = BOWLS.length)],
    ['the ball in the last bowl', 'is in a second hole of a bowl with one', (run) => (bowl(run).holes = [0, 0, 1])],
    ['the ball in the last bowl', 'is a jackpot before it has dropped', (run) => (run.jackpot = true)],
    ['the ball in the jackpot', 'has not dropped after all', (run) => (bowl(run).payout = -1)],
    ['the ball in the jackpot', 'is no jackpot', (run) => (run.jackpot = false)],
    ['the ball in the jackpot', 'has not ended the run', (run) => (run.over = false)],
    ['the ball in the jackpot', 'has no gain', (run) => (run.gain = 0)],
    ['the ball in the jackpot', 'paid less than its gain says', (run) => (bowl(run).payout = JACKPOT_START - 1)],
    ['the ball in the jackpot', 'went another way, to a hole that holds medals', (run) => (bowl(run).holes = [...FALLS[TO_MIDDLE]])],
    ['the ball in the jackpot', 'dropped in the middle bowl', (run) => (bowl(run).stage = 1)],
    ['the ball in the jackpot', 'dropped before its time', (run) => (bowl(run).elapsed = 0.5)],
    ['the ball in the jackpot', 'is shown past its time', (run) => (bowl(run).elapsed = (bowl(run).duration as number) + bowlShowTime(true))],
    ['the jackpot counted out', 'is no jackpot, and up for longer than a prize is', (run) => (run.jackpot = false)],
    ['the ball in the jackpot', 'has a total without the jackpot in it', (run) => (run.total = (run.total as number) - (run.gain as number))],
    ['the ball in the jackpot', 'won with no bowl at all', (run) => (run.bowl = null)],
    ['the ball in a hole', 'has not dropped after all', (run) => (bowl(run).payout = -1)],
    ['the ball in a hole', 'is a jackpot', (run) => (run.jackpot = true)],
    ['the ball in a hole', 'paid what another hole holds', (run) => (bowl(run).payout = TOP_PRIZE)],
    ['the ball in a hole', 'is on its way to the jackpot, and paid in a bowl it only passes through', (run) => (bowl(run).holes = [...FALLS[TO_JACKPOT]])],
    ['the ball in a hole', 'has a total without the hole in it', (run) => (run.total = RUN_PAID)],
    ['the ball in a hole', 'is shown past its time', (run) => (bowl(run).elapsed = (bowl(run).duration as number) + bowlShowTime(false))],
    ['the ball in the top bowl’s hole', 'has not dropped after all', (run) => (bowl(run).payout = -1)],
    ['the ball in the top bowl’s hole', 'paid what the middle bowl’s hole holds', (run) => (bowl(run).payout = MIDDLE_PRIZE)],
    ['the ball in the top bowl’s hole', 'dropped in the middle bowl', (run) => (bowl(run).stage = 1)],
  ];

  // Several fields changed together, so that everything agrees but the one rule each of these breaks.
  const agreed: [string, string, (thing: Row, save: Save) => void][] = [
    [
      'a spin that will win',
      'has no reach and the time of a plain spin, its outer reels alike',
      (spin) => {
        result(spin).reach = false;
        result(spin).reachKind = 'none';
        spin.duration = TIMING.spin;
      },
    ],
    [
      'a spin that will miss',
      'has a reach and the time of one, its outer reels apart',
      (spin) => {
        result(spin).reach = true;
        result(spin).reachKind = 'normal';
        spin.duration = TIMING.spin + TIMING.reach;
      },
    ],
    [
      'a spin that will miss',
      'is held up and done, like a line',
      (spin) => {
        spin.elapsed = (spin.duration as number) + 0.5;
        spin.done = true;
      },
    ],
    [
      'the first turn',
      'has made a full run with the numbers to match, and is still turning',
      (run) => {
        run.level = CHAIN_GOAL;
        run.from = 1;
        run.total = 10 * CHAIN_GOAL;
      },
    ],
    [
      'a cross',
      'has made a full run with the numbers to match',
      (run) => {
        run.level = CHAIN_GOAL;
        run.from = 1;
        run.total = 10 * CHAIN_GOAL;
      },
    ],
    [
      'a number',
      'counts for nothing, though it set off from a number',
      (run) => {
        run.level = 0;
        run.from = 1;
      },
    ],
    [
      'the ball in the jackpot',
      'paid less than a jackpot starts at, its gain and its total to match',
      (run) => {
        bowl(run).payout = JACKPOT_START - 1;
        run.gain = JACKPOT_START - 1;
        run.total = (run.total as number) - 1;
      },
    ],
    [
      'the ball in a hole',
      'paid more than its hole holds, its gain and its total to match',
      (run) => {
        bowl(run).payout = MIDDLE_PRIZE + 10;
        run.gain = MIDDLE_PRIZE + 10;
        run.total = (run.total as number) + 10;
      },
    ],
    [
      'the ball in a hole',
      'is in the hole of the jackpot with a jackpot to match, and is not called one',
      (run) => {
        Object.assign(bowl(run), { holes: [...FALLS[TO_JACKPOT]], stage: 2, duration: BOWL_TIMES[2], elapsed: BOWL_TIMES[2] + 0.5, payout: JACKPOT_START });
        run.gain = JACKPOT_START;
        run.total = RUN_PAID + JACKPOT_START;
      },
    ],
    [
      'the ball in the jackpot',
      'was paid the jackpot in the middle bowl, that bowl’s clock to match',
      (run) => {
        Object.assign(bowl(run), { stage: 1, duration: BOWL_TIMES[1], elapsed: BOWL_TIMES[1] + 0.5 });
      },
    ],
    [
      'the ball in the jackpot',
      'went to the middle bowl’s hole and was paid a jackpot there, the bowl and its clock to match',
      (run) => {
        Object.assign(bowl(run), { holes: [...FALLS[TO_MIDDLE]], stage: 1, duration: BOWL_TIMES[1], elapsed: BOWL_TIMES[1] + 0.5 });
      },
    ],
    [
      'the ball in the top bowl’s hole',
      'is in a bowl past the end of its way, that bowl’s clock to match and not yet dropped',
      (run) => {
        Object.assign(bowl(run), { stage: 1, duration: BOWL_TIMES[1], elapsed: 1, payout: -1 });
        Object.assign(run, { over: false, gain: 0, total: RUN_PAID });
      },
    ],
    [
      'the ball rolling',
      'is in a bowl after a run one number short, with the numbers to match',
      (run) => {
        run.level = CHAIN_GOAL - 1;
        run.total = (run.total as number) - (ROULETTE[FULL_RUN[0]] as number);
      },
    ],
  ];

  it.each([...impossible, ...agreed])('%s that %s is left off, and the machine kept', (name, _what, change) => {
    const save = JSON.parse(PHASES[name]) as Save;
    const { place, thing } = onScreen(save);
    change(thing, save);
    const text = JSON.stringify(save);
    expect(text).not.toBe(PHASES[name]);
    const back = restore(text, 1);
    expect(back).not.toBeNull();
    expect(back?.[place as 'spin' | 'bonus' | 'roulette']).toBeNull();
    expect(plain(back as Session)).toEqual(leftOff(save));
  });

  // The changes that would make the machine do something a second time.
  const unpay = (session: Session): void => {
    if (session.bonus) session.bonus.payout = -1;
  };
  const unland = (session: Session): void => {
    if (session.roulette) session.roulette.landed = false;
  };
  const undrop = (session: Session): void => {
    if (session.roulette?.bowl) session.roulette.bowl.payout = -1;
  };
  const paid = (session: Session): number => session.paidOut;
  const twice: [string, string, (session: Session) => void, (session: Session) => number][] = [
    [
      'a line held up',
      'count the line again',
      (session) => {
        if (session.spin) session.spin.done = false;
      },
      (session) => session.tiers.small,
    ],
    ['a square that has paid', 'pay the square again', unpay, paid],
    ['a chest open', 'pay the chest again', unpay, paid],
    ['a chest the clock picked, open', 'pay the chest again', unpay, paid],
    ['a number', 'pay the pocket again', unland, paid],
    ['a second number', 'pay the pocket again', unland, paid],
    ['the last number', 'pay the pocket again', unland, paid],
    ['the ball in the jackpot', 'pay the jackpot again', undrop, paid],
    ['the ball in the jackpot', 'count the jackpot again', undrop, (session) => session.jackpots],
    ['the jackpot counted out', 'pay the jackpot again', undrop, paid],
    ['the ball in a hole', 'pay the hole again', undrop, paid],
    ['the ball in the top bowl’s hole', 'pay the hole again', undrop, paid],
  ];

  /** Everything the screen pays or counts. */
  const books = (session: Session) => ({
    paidOut: session.paidOut,
    tiers: { ...session.tiers },
    spins: session.spins,
    roulettes: session.roulettes + session.balls,
    jackpots: session.jackpots,
    fevers: session.fevers,
    jackpot: session.jackpot,
    square: session.square,
  });

  /** Spins out of nowhere: every spin was a medal through a chucker first, and each of those is spun, held or wasted. */
  const unaccounted = (session: Session): number => session.spins + session.stock + session.wasted - session.hits;

  it.each(twice)('%s: the change that would %s does not get the chance', (name, _what, change, counted) => {
    const good = restore(PHASES[name], 1) as Session;
    const before = books(good);

    // Left as it is, the machine does nothing more in the next step.
    const intact = restore(PHASES[name], 1) as Session;
    advance(intact, DT);
    expect(books(intact)).toEqual(before);

    // Let through, the change makes it pay or count a second time.
    const letThrough = restore(PHASES[name], 1) as Session;
    change(letThrough);
    advance(letThrough, DT);
    expect(counted(letThrough)).toBeGreaterThan(counted(good));

    // Read from a save, the changed screen is left off, and one step later the books are as they were.
    const changed = restore(PHASES[name], 1) as Session;
    change(changed);
    const back = restore(serialize(changed), 1) as Session;
    expect(back).not.toBeNull();
    expect([back.spin, back.bonus, back.roulette]).toEqual([null, null, null]);
    advance(back, DT);
    // Nothing is paid or counted a second time. The reels are free now, though, so a spin the machine was holding
    // may start: what its prize threw onto the pusher has been going over the lip, and some of it through a chucker.
    expect({ ...books(back), spins: before.spins }).toEqual(before);
    expect([0, 1]).toContain(back.spins - before.spins);
    expect(unaccounted(back)).toBe(unaccounted(good));
    // A second and a tenth step pay nothing either: a roulette whose ball came back has only just set off again.
    // Nothing from the screen, that is. A jewel pushed over the front in those steps is paid its medal, which is the
    // field's business: the hopper has a jackpot's loose medals on the pusher in a few seconds, and what they push
    // sends a jewel over sooner than the slot's ten seconds of them did.
    for (let i = 0; i < 9; i++) advance(back, DT);
    expect(back.jewelBonuses).toBe(good.jewelBonuses);
    expect(back.paidOut - (back.jewels - good.jewels) * JEWEL.prize).toBe(before.paidOut);
    expect(back.tiers).toEqual(before.tiers);
    expect(back.jackpots).toBe(before.jackpots);
  });
});

describe('a screen exactly on a threshold', () => {
  it('reads back a line at the instant its reels stop, and it is gone at the instant its time is up', () => {
    const session = quiet();
    session.stock = 1;
    script(session, [0.03, 0, 0.5]);
    advance(session, 0);
    const duration = session.spin?.duration ?? 0;
    expect(duration).toBe(TIMING.spin + (TIMING.reach + TIMING.longReach));
    advance(session, duration);
    expect(session.spin).toMatchObject({ elapsed: duration, done: true });
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, TIMING.celebrate);
    expect(session.spin).toBeNull();
    expect(session.bonus?.kind).toBe('sugoroku');
    expect(serialize(reread(session))).toBe(serialize(session));
  });

  it('reads back a missing spin up to the last instant, and it is gone when its reels stop', () => {
    const session = quiet();
    session.stock = 1;
    script(session, [0.99]);
    advance(session, 0);
    expect(session.spin).toMatchObject({ elapsed: 0, done: false });
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, (session.spin?.duration ?? 0) - 1e-9);
    expect(session.spin?.done).toBe(false);
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, 2e-9);
    expect(session.spin).toBeNull();
    expect(session.tiers.miss).toBe(1);
  });

  it('reads back a piece at the instant it lands and pays', () => {
    const session = quiet();
    session.stock = 1;
    script(session, [0.03, 0, 0.5]);
    advance(session, 0);
    advance(session, (session.spin?.duration ?? 0) + TIMING.celebrate);
    const bonus = session.bonus;
    if (bonus?.kind !== 'sugoroku') throw new Error('no roll on the board');
    expect(bonus.elapsed).toBe(0);
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, bonus.duration);
    expect(bonus).toMatchObject({ elapsed: bonus.duration, payout: BOARD[session.square] });
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, TIMING.prize);
    expect(session.bonus).toBeNull();
  });

  it('reads back a chest at the instant the clock picks, the instant it opens, and never past its time', () => {
    const session = quiet();
    session.stock = 1;
    script(session, [0.01, 0]);
    advance(session, 0);
    advance(session, (session.spin?.duration ?? 0) + TIMING.celebrate);
    const bonus = session.bonus;
    if (bonus?.kind !== 'chest') throw new Error('no chests');
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, TIMING.choose);
    expect(bonus).toMatchObject({ picked: bonus.fallback, pickedAt: TIMING.choose, elapsed: TIMING.choose, told: true, payout: -1 });
    expect(serialize(reread(session))).toBe(serialize(session));
    // A pick made at that very instant is the clock's, so it is the clock's chest or it is nothing.
    const save = JSON.parse(serialize(session)) as Save;
    (save.screen.bonus as Row).picked = (bonus.fallback + 1) % CHESTS.length;
    expect(restore(JSON.stringify(save), 1)).toMatchObject({ bonus: null, credits: session.credits });
    advance(session, TIMING.open);
    expect(bonus.elapsed).toBe(bonus.pickedAt + TIMING.open);
    expect(bonus.payout).toBe(bonus.prizes[bonus.picked]);
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, TIMING.prize);
    expect(session.bonus).toBeNull();
  });

  it('reads back a roulette at the instant the light stops, on a number and on a cross', () => {
    const session = quiet();
    session.balls = 1;
    script(session, [pocketRoll(1), pocketRoll(0)]);
    advance(session, 0);
    advance(session, TIMING.roulette);
    expect(session.roulette).toMatchObject({ elapsed: TIMING.roulette, landed: true, over: false, gain: 10 });
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, TIMING.step);
    expect(session.roulette).toMatchObject({ elapsed: 0, landed: false, level: 1, from: 1 });
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, TIMING.roulette);
    expect(session.roulette).toMatchObject({ elapsed: TIMING.roulette, landed: true, over: true, gain: 0 });
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, TIMING.prize);
    expect(session.roulette).toBeNull();
  });

  it('reads back a full run at the instant the ball is let go, at each instant it drops, and to the last of its prize', { timeout: LONG }, () => {
    const session = quiet();
    session.balls = 1;
    script(session, [...FULL_RUN.map(pocketRoll), fallRoll(TO_JACKPOT)]);
    advance(session, 0);
    for (let turn = 1; turn <= CHAIN_GOAL; turn++) {
      advance(session, TIMING.roulette);
      expect(session.roulette).toMatchObject({ elapsed: TIMING.roulette, landed: true, level: turn, bowl: null });
      expect(serialize(reread(session))).toBe(serialize(session));
      advance(session, TIMING.step);
      expect(serialize(reread(session))).toBe(serialize(session));
    }
    // The last number's time is up to the instant, and the ball has only just been let go.
    expect(session.roulette).toMatchObject({ elapsed: TIMING.roulette + TIMING.step, level: CHAIN_GOAL, gain: 0, over: false });
    const holes = [...FALLS[TO_JACKPOT]];
    expect(session.roulette?.bowl).toEqual({ holes, stage: 0, elapsed: 0, duration: BOWL_TIMES[0], payout: -1 });
    // At the instant its time in a bowl is up it is through its hole and in the bowl below, its clock at nothing.
    for (const below of [1, 2]) {
      advance(session, BOWL_TIMES[below - 1]);
      expect(session.roulette?.bowl).toEqual({ holes, stage: below, elapsed: 0, duration: BOWL_TIMES[below], payout: -1 });
      expect(session.roulette).toMatchObject({ over: false, jackpot: false, gain: 0 });
      expect(serialize(reread(session))).toBe(serialize(session));
    }
    advance(session, BOWL_TIMES[2]);
    expect(session.roulette?.bowl).toEqual({ holes, stage: 2, elapsed: BOWL_TIMES[2], duration: BOWL_TIMES[2], payout: JACKPOT_START });
    expect(session.roulette).toMatchObject({ over: true, jackpot: true, gain: JACKPOT_START });
    expect(serialize(reread(session))).toBe(serialize(session));
    // The jackpot is up for as long as it is counted out, to the last instant, and gone when that time is up.
    advance(session, bowlShowTime(true) - 1e-9);
    expect(session.roulette?.bowl?.payout).toBe(JACKPOT_START);
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, 2e-9);
    expect(session.roulette).toBeNull();
    expect(session.jackpots).toBe(1);
  });

  it('reads back a prize from an upper bowl to the last instant it is up, which is sooner than a jackpot', () => {
    const session = quiet();
    session.balls = 1;
    script(session, [...FULL_RUN.map(pocketRoll), fallRoll(TO_TOP)]);
    advance(session, 0);
    for (let turn = 1; turn <= CHAIN_GOAL; turn++) {
      advance(session, TIMING.roulette);
      advance(session, TIMING.step);
    }
    advance(session, BOWL_TIMES[0]);
    expect(session.roulette?.bowl).toEqual({ holes: [...FALLS[TO_TOP]], stage: 0, elapsed: BOWL_TIMES[0], duration: BOWL_TIMES[0], payout: TOP_PRIZE });
    expect(serialize(reread(session))).toBe(serialize(session));
    expect(bowlShowTime(false)).toBeLessThan(bowlShowTime(true));
    advance(session, bowlShowTime(false) - 1e-9);
    expect(session.roulette?.bowl?.payout).toBe(TOP_PRIZE);
    expect(serialize(reread(session))).toBe(serialize(session));
    // A save that has it up for a moment longer has it up for longer than the machine does.
    const save = JSON.parse(serialize(session)) as Save;
    ((save.screen.roulette as Row).bowl as Row).elapsed = BOWL_TIMES[0] + bowlShowTime(false);
    expect(restore(JSON.stringify(save), 1)).toMatchObject({ roulette: null, credits: session.credits });
    advance(session, 2e-9);
    expect(session.roulette).toBeNull();
    expect(session.jackpots).toBe(0);
  });
});

describe('any moment of any session', () => {
  it('is a save that reads back as it was, and plays on as the session would have', { timeout: LONG }, () => {
    const chance = seededRng(20261011);
    const seen = new Map<string, number>();
    const note = (phase: string) => seen.set(phase, (seen.get(phase) ?? 0) + 1);

    /** Seconds until the screen comes to one of its thresholds, if that is soon. */
    const untilThreshold = (session: Session): number => {
      const { spin, bonus, roulette } = session;
      const at: number[] = [];
      if (spin) at.push(spin.duration - spin.elapsed, spin.duration + TIMING.celebrate - spin.elapsed);
      if (bonus?.kind === 'sugoroku') at.push(bonus.duration - bonus.elapsed, bonus.duration + TIMING.prize - bonus.elapsed);
      if (bonus?.kind === 'chest') {
        if (bonus.picked < 0) at.push(TIMING.choose - bonus.elapsed);
        else at.push(bonus.pickedAt + TIMING.open - bonus.elapsed, bonus.pickedAt + TIMING.open + TIMING.prize - bonus.elapsed);
      }
      if (roulette?.bowl) at.push(roulette.bowl.duration - roulette.bowl.elapsed, roulette.bowl.duration + bowlShowTime(roulette.jackpot) - roulette.bowl.elapsed);
      else if (roulette) at.push(roulette.duration - roulette.elapsed, roulette.duration + TIMING.step - roulette.elapsed, roulette.duration + TIMING.prize - roulette.elapsed);
      const soon = at.filter((seconds) => seconds > 0 && seconds <= 0.25);
      return soon.length > 0 ? soon[Math.floor(chance() * soon.length)] : 0;
    };

    /** The draws of a machine: fair ones, or far more winning lines than a slot gives. */
    const drawsFor = (seed: number, lucky: boolean): (() => number) => {
      const draws = seededRng(seed);
      return lucky ? () => (draws() < 0.3 ? draws() * 0.06 : draws()) : draws;
    };

    let saves = 0;
    let replays = 0;
    const check = (session: Session, lucky: boolean): void => {
      const text = serialize(session);
      const back = restore(text, 1);
      if (!back || serialize(back) !== text) {
        const { screen, session: numbers } = JSON.parse(text);
        throw new Error(`a save taken from a session did not read back: ${JSON.stringify({ screen, square: numbers.square, quickPick: numbers.quickPick })}`);
      }
      saves += 1;
      const { spin, bonus, roulette } = session;
      if (spin) {
        note(spin.done ? 'line held up' : 'reels running');
        if (spin.result.reachKind === 'long') note(spin.result.tier === 'miss' ? 'long reach that misses' : 'long reach that wins');
        if (spin.result.reachKind === 'normal') note(spin.result.tier === 'miss' ? 'reach that misses' : 'reach that wins');
        if (spin.elapsed === spin.duration) note('on a threshold');
      } else if (bonus?.kind === 'sugoroku') {
        note(bonus.payout < 0 ? 'die and hops' : 'prize shown');
        if (bonus.elapsed === bonus.duration) note('on a threshold');
      } else if (bonus?.kind === 'chest') {
        note(bonus.picked < 0 ? 'choosing' : !bonus.told ? 'just picked' : bonus.payout < 0 ? 'picked' : 'open');
        if (bonus.picked >= 0 && (bonus.elapsed === bonus.pickedAt + TIMING.open || bonus.pickedAt === TIMING.choose)) note('on a threshold');
      } else if (roulette?.bowl) {
        note(roulette.bowl.payout < 0 ? 'ball rolling' : roulette.jackpot ? 'ball in the jackpot' : 'ball in a hole');
        if (roulette.bowl.payout < 0 && roulette.bowl.stage > 0) note(roulette.bowl.stage === 1 ? 'ball in the middle bowl' : 'ball in the last bowl');
        // The instant it drops for good, and the instant it comes through a hole into the bowl below.
        if (roulette.bowl.elapsed === roulette.bowl.duration || (roulette.bowl.stage > 0 && roulette.bowl.elapsed === 0)) note('on a threshold');
      } else if (roulette) {
        note(!roulette.landed ? 'turning' : roulette.over ? 'on a cross' : roulette.level === CHAIN_GOAL ? 'on the last number' : 'on a number');
        if (roulette.elapsed === roulette.duration) note('on a threshold');
      } else {
        note('nothing on');
      }

      // What the arms hold is in the save as well, whatever the screen is doing.
      const onRails = session.machine.rolling.length;
      const onOne = Math.max(...([0, 1] as const).map((arm) => session.machine.rolling.filter((medal) => medal.arm === arm).length));
      if (onRails > 0) note(onOne === LIMITS.rolling / 2 ? 'a rail full' : 'a medal on a rail');
      if (session.machine.rolling.some((medal) => medal.arm === 0) && session.machine.rolling.some((medal) => medal.arm === 1)) note('both arms in use');

      // Now and then, play the save on beside the session it was taken from. A save does not hold the
      // generator, so both are given the same one; with the same play they must end in the same place.
      if (saves % 40 !== 0) return;
      replays += 1;
      session.machine.rng = drawsFor(7000 + saves, lucky);
      back.machine.rng = drawsFor(7000 + saves, lucky);
      for (let step = 0; step < 30; step++) {
        for (const machine of [session, back]) {
          if (machine.credits === 0) refill(machine);
          if (step % 6 === 0) insertAt(machine, 15 + ((step * 11) % 70));
          advance(machine, step % 5 === 0 ? 0.1 : DT);
        }
      }
      if (serialize(back) !== serialize(session)) throw new Error('a save that was read back did not play on as its session did');
    };

    for (let n = 0; n < 24; n++) {
      // Every sixth machine picks its chests at once, as the simulation's does.
      const session = createSession(100 + n, { balls: n % 3, quickPick: n % 6 === 4 });
      // One machine in four keeps its tables as they are. The others are swept bare now and then:
      // the screen does not care what lies on the field, and a bare field runs many times faster.
      const swept = n % 4 !== 0;
      // Two machines in three draw far more winning lines than a slot gives, so that every game comes up often.
      // The third draws fairly and is fed balls, so that its screen is all roulette and many runs reach the bowl.
      const lucky = n % 3 !== 0;
      session.machine.rng = drawsFor(900 + n, lucky);

      for (let i = 0; i < (swept ? 3000 : 500); i++) {
        if (swept && i % 300 === 0) Object.assign(session.machine, { medals: [], falling: [], payoutQueue: 0, growing: 0, hopper: shutHopper(), lifts: [] });
        // The player and the field: medals dropped, a medal through a chucker, a ball over the front, a chest picked.
        if (session.credits === 0) refill(session);
        if (chance() < 0.2) insertAt(session, 10 + chance() * 80);
        if (session.stock < MAX_STOCK && chance() < (lucky ? 0.3 : 0.02)) session.stock += 1;
        if (session.balls < 2 && chance() < (lucky ? 0.001 : 0.3)) session.balls += 1;
        // The player picks at some moment while there is a choice. On a machine that picks at once,
        // that is only the moment the chests appear. Either way the save is taken before the next step.
        const offered = session.bonus?.kind === 'chest' && session.bonus.picked < 0;
        if (offered && chance() < (session.quickPick ? 0.5 : 0.004) && pickChest(session, Math.floor(chance() * CHESTS.length))) check(session, lucky);

        // A frame: none at all, a sixtieth, the longest the cabinet allows, anything between, or just what it takes to reach a threshold.
        const roll = chance();
        const exact = roll >= 0.7 ? untilThreshold(session) : 0;
        advance(session, exact > 0 ? exact : roll < 0.05 ? 0 : roll < 0.4 ? DT : roll < 0.5 ? 0.1 : chance() * 0.1);
        if (chance() < 0.4) check(session, lucky);
      }
    }

    const spins = ['reels running', 'line held up', 'reach that wins', 'reach that misses', 'long reach that wins', 'long reach that misses'];
    const games = ['die and hops', 'prize shown', 'choosing', 'just picked', 'picked', 'open'];
    const runs = ['turning', 'on a number', 'on a cross', 'on the last number', 'ball rolling', 'ball in the middle bowl', 'ball in the last bowl', 'ball in the jackpot', 'ball in a hole'];
    for (const phase of ['nothing on', ...spins, ...games, ...runs]) expect(seen.get(phase) ?? 0, phase).toBeGreaterThan(5);
    for (const rails of ['a medal on a rail', 'a rail full', 'both arms in use']) expect(seen.get(rails) ?? 0, rails).toBeGreaterThan(20);
    expect(seen.get('on a threshold') ?? 0).toBeGreaterThan(20);
    expect(saves).toBeGreaterThan(10_000);
    expect(replays).toBeGreaterThan(200);
  });
});

describe('a save written before a reach had a kind and the roulette its bowl', () => {
  // What the game wrote then: a spin's result with no `reachKind`, a roulette with no `bowl`, a run of six
  // numbers that ended in the jackpot itself, and at most four spins held. Nothing else had another shape.
  const OLD_SPIN = { result: { tier: 'small', digits: [4, 4, 4], reach: true }, elapsed: 0.5, duration: TIMING.spin + TIMING.reach, done: false };
  const OLD_TURN = { pocket: 1, from: 0, elapsed: 0.2, duration: TIMING.roulette, landed: false, level: 0, total: 0, gain: 0, over: false, jackpot: false };
  const OLD_FIFTH = { ...OLD_TURN, pocket: 6, from: 5, level: 5, total: 80 };
  const OLD_JACKPOT = { ...OLD_TURN, pocket: 7, from: 6, elapsed: 3, landed: true, level: 6, total: 440, gain: 300, over: true, jackpot: true };
  const old = (screen: Row): string =>
    damaged((save) => {
      save.session.stock = 4;
      save.screen = { spin: null, bonus: null, roulette: null, ...screen };
    });
  /** The machine under an old save's screen: every such save has the same one. */
  const machine = plain(restore(old({}), 1) as Session);

  it('is the machine it was when nothing was on its screen: that much has not changed shape', () => {
    expect(machine).toMatchObject({ stock: 4, spin: null, bonus: null, roulette: null, roulettes: 3, balls: 0 });
    expect(machine.machine.medals).toHaveLength(good().machine.medals.length);
  });

  it('loses the spin it was in the middle of, whole, and keeps the machine', () => {
    const back = restore(old({ spin: OLD_SPIN }), 1);
    expect(back).not.toBeNull();
    expect(plain(back as Session)).toEqual(machine);
  });

  const runs: [string, Row][] = [
    ['a roulette that had no bowl to end in', OLD_TURN],
    ['a fifth number, more than a full run is now', OLD_FIFTH],
    ['a jackpot won on the wheel itself', OLD_JACKPOT],
  ];

  it.each(runs)('loses %s, whole, keeps the machine and gets the ball back', (_name, roulette) => {
    const back = restore(old({ roulette }), 1);
    expect(back).not.toBeNull();
    expect(plain(back as Session)).toEqual({ ...machine, balls: 1, roulettes: 2 });
    // Giving it the field the new game adds does not make a run of five or six one the new game has.
    const patched = restore(old({ roulette: { ...roulette, bowl: null } }), 1);
    expect(patched?.roulette).toEqual(roulette === OLD_TURN ? { ...OLD_TURN, bowl: null } : null);
  });

  it('is never half read: what comes back is a whole machine of this game, and it plays', { timeout: LONG }, () => {
    for (const screen of [{}, { spin: OLD_SPIN }, { roulette: OLD_TURN }, { roulette: OLD_FIFTH }, { roulette: OLD_JACKPOT }, { spin: OLD_SPIN, roulette: OLD_TURN }]) {
      const back = restore(old(screen), 7) as Session;
      expect([back.spin, back.bonus, back.roulette]).toEqual([null, null, null]);
      // It goes on to spin its held spins, and first the roulette of any ball it was given back, in today's shapes.
      let shown = 0;
      for (let i = 0; i < 600; i++) {
        if (i % 20 === 0) insertAt(back, 20 + (i % 60));
        advance(back, DT);
        if (back.spin) expect(REACH_KINDS).toContain(back.spin.result.reachKind);
        if (back.roulette) expect(back.roulette).toHaveProperty('bowl');
        if (back.spin || back.roulette) shown += 1;
      }
      expect(shown).toBeGreaterThan(100);
      const again = restore(serialize(back), 1);
      expect(again).not.toBeNull();
      expect(serialize(again as Session)).toBe(serialize(back));
    }
  });

  it('is refused as a whole, without throwing, when the machine itself is of another shape', () => {
    // No version before this one differed there. If one had, there would be no machine to keep.
    expect(restore(damaged((save) => delete save.session.quickPick), 1)).toBeNull();
    expect(restore(damaged((save) => delete save.machine.waits), 1)).toBeNull();
    expect(restore(damaged((save) => (save.version = 0)), 1)).toBeNull();
  });
});

describe('the versions a save can carry', () => {
  /**
   * A save of today's as the game the day before jewels would have written the same machine with no jewel on it:
   * that game's field, which had no payout works either, and its numbers, which have no lamps among them, the
   * jewels' or the lucky one's. A held spin that the lucky lamp made gold is an ordinary one in that game, which
   * had only the gold of a full hold.
   */
  const withoutJewels = (save: Save): Save => {
    const { jewels: _jewels, jewelBonuses: _bonuses, ...session } = withoutLamp(save).session;
    const { hopper: _hopper, lifts: _lifts, ...field } = save.machine;
    const noJewel = (medal: Row): boolean => medal.jewel !== true;
    if (save.session.chance !== false) throw new Error('a gold spin on the screen may be the lamp’s, and that game could not show it');
    return {
      ...save,
      version: VERSION_BEFORE_JEWELS,
      machine: { ...field, medals: save.machine.medals.filter(noJewel), falling: save.machine.falling.filter(noJewel) },
      session: { ...session, gold: Math.min(session.gold as number, session.gilded as number) } as Save['session'],
    };
  };

  it('are eight: the arms, an aim for each, chance time, the three bowls, the jewels, the payout works and the lucky lamp each took one', () => {
    expect([VERSION_BEFORE_ARMS, VERSION_WITH_ONE_AIM, VERSION_BEFORE_CHANCE, VERSION_WITH_ONE_BOWL, VERSION_BEFORE_JEWELS, VERSION_BEFORE_WORKS, VERSION_BEFORE_LAMP, STORAGE_VERSION]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(JSON.parse(serialize(createSession(1))).version).toBe(8);
  });

  it('do not take a save of this version for one of an older: it has two numbers no older game wrote', () => {
    for (const phase of Object.keys(PHASES)) {
      const today = JSON.parse(PHASES[phase]) as Save;
      for (const key of LAMP_NUMBERS) expect(today.session, phase).toHaveProperty(key);
      for (const older of [VERSION_BEFORE_LAMP, VERSION_BEFORE_WORKS, VERSION_BEFORE_JEWELS, VERSION_WITH_ONE_BOWL, VERSION_BEFORE_CHANCE, VERSION_WITH_ONE_AIM, VERSION_BEFORE_ARMS]) {
        expect(restore(JSON.stringify({ ...today, version: older }), 1), `${phase} as ${older}`).toBeNull();
      }
      // Nor is it a save of this version without them, or with only one of them.
      expect(restore(JSON.stringify(withoutLamp(today)), 1), phase).toBeNull();
      for (const key of LAMP_NUMBERS) {
        const lacking = JSON.parse(PHASES[phase]) as Save;
        delete lacking.session[key];
        expect(restore(JSON.stringify(lacking), 1), `${phase} without ${key}`).toBeNull();
      }
    }
  });

  it('take a save of this version less the lamp’s two numbers for the one before the lamp, which had today’s field', () => {
    const seen = { same: 0, refused: 0, read: 0 };
    for (const phase of Object.keys(PHASES)) {
      const today = JSON.parse(PHASES[phase]) as Save;
      const { gold, gilded, lucky, rush, chance } = today.session as unknown as Pick<Session, 'gold' | 'gilded' | 'lucky' | 'rush' | 'chance'>;
      // None of them was caught with a gold spin on its screen.
      expect(chance, phase).toBe(false);
      const before = restore(JSON.stringify({ ...withoutLamp(today), version: VERSION_BEFORE_LAMP }), 1);
      if (lucky === 0) {
        // A machine the lamp has made no spin gold on: the version before the lamp wrote the same save but for the
        // number and those two. It reads as the same machine, and is written back as today's save of it.
        seen.same += 1;
        expect(rush, phase).toBe(gold > 0);
        expect(before, phase).not.toBeNull();
        expect(serialize(before as Session), phase).toBe(PHASES[phase]);
      } else if (gold > gilded) {
        // More gold spins held than medals that found the hold full: less the lamp's count there is no medal to
        // account for one of them, and the game before the lamp could not have written that.
        seen.refused += 1;
        expect(before, phase).toBeNull();
      } else {
        // Its gold spins are no more than its full hold has turned: the game before the lamp could have written
        // it, and it reads by that game's rule, with none of them the lamp's and chance time on while one is held.
        seen.read += 1;
        expect(before, phase).toMatchObject({ lucky: 0, gold, gilded, rush: gold > 0 });
      }
    }
    expect(seen.same).toBeGreaterThan(Object.keys(PHASES).length / 2);
    expect(seen.refused).toBeGreaterThan(0);
  });

  it('do not take a save with jewels on its field and lamps among its numbers for one of a version before the jewels', () => {
    for (const phase of ['a spin that will win', 'chests to choose from', 'the ball rolling', 'the ball in the jackpot']) {
      const today = JSON.parse(PHASES[phase]) as Save;
      expect(today.machine.medals.some((medal) => medal.jewel === true), phase).toBe(true);
      // Less the lucky lamp's two numbers it is still no save of a version before the payout works: it has their
      // doors and lifts in its field, jewels on it, and the jewel lamps among its numbers.
      for (const older of [VERSION_BEFORE_WORKS, VERSION_BEFORE_JEWELS, VERSION_WITH_ONE_BOWL, VERSION_BEFORE_CHANCE, VERSION_WITH_ONE_AIM, VERSION_BEFORE_ARMS]) {
        expect(restore(JSON.stringify({ ...withoutLamp(today), version: older }), 1), `${phase} as ${older}`).toBeNull();
      }
      // With the jewels off its field, no payout works in it and no lamps among its numbers it is what the version
      // before jewels would have written, and reads as that: the same machine, with no lamp lit, the doors shut and a
      // lift at work under any tower that was going up.
      const before = withoutJewels(today);
      const back = restore(JSON.stringify(before), 1);
      expect(back, phase).not.toBeNull();
      if (!back) continue;
      expect([jewelsOnField(back.machine), back.jewels, back.jewelBonuses], phase).toEqual([0, 0, 0]);
      expect(JSON.parse(serialize(back)), phase).toEqual({ ...before, version: STORAGE_VERSION, machine: withWorks(before.machine), session: numbersWithLamp(before.session) });
      // Called a save of this version, it has not this version's numbers.
      expect(restore(JSON.stringify({ ...before, version: STORAGE_VERSION }), 1), phase).toBeNull();
    }
  });

  it('do not take a save with the ball in the three bowls for one of a version that had one bowl', () => {
    for (const phase of ['the ball rolling', 'the ball in the middle bowl', 'the ball in the jackpot', 'the ball in a hole']) {
      const threeBowls = withoutJewels(JSON.parse(PHASES[phase]) as Save);
      expect(restore(JSON.stringify(threeBowls), 1)?.roulette, phase).not.toBeNull();
      // Called the version with chance time and one bowl, its numbers are that version's and its ball is not: the roulette goes and the ball comes back.
      threeBowls.version = VERSION_WITH_ONE_BOWL;
      const other = restore(JSON.stringify(threeBowls), 1);
      expect(other?.roulette, phase).toBeNull();
      expect(plain(other as Session), phase).toEqual(leftOff(threeBowls));
      // Called anything older, it has numbers that game did not have, and is no save at all.
      for (const older of [VERSION_BEFORE_CHANCE, VERSION_WITH_ONE_AIM, VERSION_BEFORE_ARMS]) {
        threeBowls.version = older;
        expect(restore(JSON.stringify(threeBowls), 1), `${phase} as ${older}`).toBeNull();
      }
    }
    // With no ball in a bowl the version with three bowls and the one before it write the same save but for the number, and each reads as the other.
    for (const phase of ['a spin that will win', 'a chest picked', 'a second number', 'a cross', 'the last number']) {
      const threeBowls = withoutJewels(JSON.parse(PHASES[phase]) as Save);
      const read = restore(JSON.stringify(threeBowls), 1);
      const before = restore(JSON.stringify({ ...threeBowls, version: VERSION_WITH_ONE_BOWL }), 1);
      expect(read, phase).not.toBeNull();
      expect(before, phase).not.toBeNull();
      expect(serialize(before as Session), phase).toBe(serialize(read as Session));
    }
  });
});

/**
 * The two versions that wrote the one bowl on today's field, each in a save written by that version's own
 * `serialize` (see each fixture's `about`): the game before chance time, and the game with it. That game had one
 * bowl with a hole for each of the three ends, and wrote the ball down as the hole it was going to.
 */
const ONE_BOWL_SAVES = [
  ['before chance time, version 3', beforeThreeBowls, VERSION_BEFORE_CHANCE],
  ['with chance time and gold spins held, version 4', withChanceAndOneBowl, VERSION_WITH_ONE_BOWL],
] as const;

describe.each(ONE_BOWL_SAVES)('a save written when a full run ended in one bowl, %s', (_name, fixture, version) => {
  const OLD = fixture.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = fixture;
  /** Whether that game had chance time: its numbers are today's less the jewel lamps and the lucky lamp's two then, and otherwise less chance time's three as well. */
  const withChance = version === VERSION_WITH_ONE_BOWL;
  const CHANCE_NUMBERS = ['gold', 'gilded', 'chance'];
  const JEWEL_NUMBERS = ['jewels', 'jewelBonuses'];
  /**
   * The numbers of the fixture as today's game holds them: no jewel lamp lit, none of its gold spins gold from the
   * start, and chance time on if a gold spin is held or playing, which is what chance time was in the game that had it.
   */
  const numbersNow = (session: Row): Row => (withChance ? numbersWithLamp(session) : numbersToday(session));
  /** That game's one bowl: how long the ball rolled in it, and how long its prize then stayed up. */
  const ONE_BOWL = { time: 6.5, prize: 2.2 };
  /** What the numbers of the fixture's run had come to before the ball was let go. */
  const RUN = (old().screen.roulette as Row).total as number;
  /** The fixture with its roulette changed, and its one bowl. */
  const changed = (change: (run: Row, bowl: Row, save: Save) => void): Save => {
    const save = old();
    const run = save.screen.roulette as Row;
    change(run, run.bowl as Row, save);
    return save;
  };
  /** The fixture as that game would have written it a moment after the ball dropped into one of its three holes. */
  const dropped = (hole: number, since: number): Save =>
    changed((run, bowl, save) => {
      const jackpot = BOWL[hole] === 'jackpot';
      const payout = jackpot ? (save.session.jackpot as number) : (BOWL[hole] as number);
      Object.assign(bowl, { hole, elapsed: ONE_BOWL.time + since, payout });
      Object.assign(run, { over: true, jackpot, gain: payout, total: RUN + payout });
      save.session.paidOut = (save.session.paidOut as number) + payout;
      if (jackpot) Object.assign(save.session, { jackpot: JACKPOT_START, jackpots: 1 });
    });

  it('is a save of that version: today’s field, and a ball rolling in the one bowl towards the jackpot', () => {
    const save = old();
    expect(save.version).toBe(version);
    expect(save.version).not.toBe(STORAGE_VERSION);
    // Nothing of the field has another shape than today's, but that it has no payout works, which came after it. The
    // numbers are today's too, but for the jewel lamps, which no version before the sixth had, for the lucky lamp's
    // two, and for chance time's three before there was chance time.
    for (const key of ['hopper', 'lifts']) expect(save.machine).not.toHaveProperty(key);
    expect(Object.keys(withWorks(save.machine))).toEqual(Object.keys(good().machine));
    expect(Object.keys(good().session).slice(-JEWEL_NUMBERS.length)).toEqual(JEWEL_NUMBERS);
    const today = Object.keys(good().session).filter((key) => !JEWEL_NUMBERS.includes(key));
    const lampless = today.filter((key) => !LAMP_NUMBERS.includes(key));
    expect(Object.keys(save.session)).toEqual(withChance ? lampless : lampless.filter((key) => !CHANCE_NUMBERS.includes(key)));
    expect(today.filter((key) => CHANCE_NUMBERS.includes(key) || LAMP_NUMBERS.includes(key))).toEqual(['gold', 'gilded', 'lucky', 'rush', 'chance']);
    expect([...save.machine.medals, ...save.machine.falling].some((medal) => 'jewel' in medal)).toBe(false);
    expect(save.machine.medals.length).toBeGreaterThan(200);
    expect(save.session.inserted).toBeGreaterThan(100);
    // A full run, and the ball some two and a half seconds into the bowl, with the jackpot grown past where one starts.
    const run = save.screen.roulette as Row;
    expect(run).toMatchObject({ landed: true, level: CHAIN_GOAL, total: RUN, gain: 0, over: false, jackpot: false });
    expect(RUN).toBeGreaterThanOrEqual(10 * CHAIN_GOAL);
    const bowl = run.bowl as Row;
    expect(Object.keys(bowl)).toEqual(['hole', 'elapsed', 'duration', 'payout']);
    expect(bowl).toMatchObject({ hole: BOWL.indexOf('jackpot'), duration: ONE_BOWL.time, payout: -1 });
    expect(bowl.elapsed).toBeGreaterThan(2.4);
    expect(bowl.elapsed).toBeLessThan(2.5);
    expect(save.session.jackpot).toBe(then.end.payout);
    expect(then.end.payout).toBeGreaterThan(JACKPOT_START);
    expect(then.end).toMatchObject({ type: 'bowlEnd', jackpot: true, total: RUN + then.end.payout });
    // With chance time it was caught with the hold full and all but one of the held spins gold, none of them on the screen.
    if (withChance) expect(save.session).toMatchObject({ stock: MAX_STOCK, gold: MAX_STOCK - 1, gilded: MAX_STOCK - 1, chance: false });
    // The top bowl of the three is as long as that one bowl was, which is why the ball can be as far into it.
    expect(BOWL_TIMES[0]).toBe(ONE_BOWL.time);
    expect(TIMING.bowl).toBe(ONE_BOWL.time);
  });

  it('reads back as the same machine, the ball in the top bowl of three and as far into its roll', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    // The field, the purse and the counters are what was written, to the last digit, with the payout works at rest.
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(withWorks(save.machine)));
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersNow(save.session)));
    expect([spin, bonus]).toEqual([null, null]);
    // No jewel is laid on a machine that was already in play, and no lamp is lit.
    expect([jewelsOnField(back.machine), back.jewels, back.jewelBonuses]).toEqual([0, 0, 0]);
    // The spins that were gold are gold, as many as there were, and a save from before chance time has none.
    expect(chanceLeft(back)).toBe(withChance ? save.session.gold : 0);
    expect(back.stock).toBe(save.session.stock);
    // None of them was gold from the start. With gold spins held it was in chance time, as that game had it, and is
    // in chance time now, its wings open; a save from before chance time is not.
    expect([back.lucky, back.rush]).toEqual([0, withChance]);
    // So is the run. The ball's end had been drawn, and it is the same end: it is on the first way down that leads
    // to the jackpot, in the top bowl, its clock where it was, and nothing paid.
    const { bowl: oldBowl, ...run } = save.screen.roulette as Row & { bowl: Row };
    expect(roulette).toEqual({ ...run, bowl: { holes: [...FALLS[TO_JACKPOT]], stage: 0, elapsed: oldBowl.elapsed, duration: BOWL_TIMES[0], payout: -1 } });
    expect(fallEnd(roulette?.bowl?.holes ?? [])).toBe(BOWL[oldBowl.hole as number]);
    expect(back.balls).toBe(save.session.balls);
    expect(back.roulettes).toBe(save.session.roulettes);
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    const again = JSON.parse(text) as Save;
    expect(again.version).toBe(STORAGE_VERSION);
    expect(again.machine).toEqual(withWorks(old().machine));
    expect(JSON.stringify(again.session)).toBe(JSON.stringify(numbersNow(old().session)));
    expect((again.screen.roulette as Row).bowl).toEqual(back.roulette?.bowl);
    const twice = restore(text, 2) as Session;
    expect(plain(twice)).toEqual(plain(back));
    expect(serialize(twice)).toBe(text);
  });

  it('plays on down all three bowls to the end that was drawn for it, and the jackpot is paid once and to the medal', { timeout: LONG }, () => {
    const back = restore(OLD, then.seed) as Session;
    const held = chanceLeft(back);
    const drops: { step: number; bowl: number }[] = [];
    const ends: { step: number; event: SessionEvent }[] = [];
    let steps = 0;
    while (back.roulette) {
      const events: SessionEvent[] = [];
      const before = medalsOnField(back.machine) + back.won + back.lost;
      advance(back, DT, events);
      steps += 1;
      if (steps > 60 * 60) throw new Error('the run never ended');
      // While the ball is in the bowls the screen is the ball's: no gold spin is on it, and none that is held is played or lost.
      expect(back.chance).toBe(false);
      expect(back.gold).toBeGreaterThanOrEqual(held);
      for (const event of events) {
        if (event.type === 'bowlDrop') drops.push({ step: steps, bowl: event.bowl });
        if (event.type !== 'bowlEnd') continue;
        ends.push({ step: steps, event });
        // In the step it is paid, the field has that many medals more and not one besides.
        expect(medalsOnField(back.machine) + back.won + back.lost - before).toBe(then.end.payout);
      }
    }
    // It goes through the top bowl's hole in the very step that game dropped it into the jackpot's, and on from there.
    expect(drops.map(({ bowl }) => bowl)).toEqual([1, 2]);
    expect(drops[0].step).toBe(then.steps);
    expect(Math.abs(drops[1].step - drops[0].step - BOWL_TIMES[1] / DT)).toBeLessThanOrEqual(1);
    expect(ends).toHaveLength(1);
    expect(Math.abs(ends[0].step - drops[1].step - BOWL_TIMES[2] / DT)).toBeLessThanOrEqual(1);
    // The same jackpot that game paid, to the medal, gold spins held or not: a ball's prize is never paid over.
    // Every place for a tower was free, so what is poured is the share that always is.
    const { payout, total } = then.end;
    expect(ends[0].event).toEqual({ type: 'bowlEnd', bowl: 2, hole: 0, payout, poured: pouredOf(payout), total, jackpot: true });
    expect(back.paidOut).toBe(then.paidOut);
    expect(back.jackpots).toBe(then.jackpots);
    expect(back.jackpot).toBe(then.jackpot);
    // The prize was up for as long as a jackpot is counted out.
    expect(Math.abs(steps - ends[0].step - bowlShowTime(true) / DT)).toBeLessThanOrEqual(1);
    // Then the screen is free, and the gold spins it held are still held and still gold.
    expect(back.chance).toBe(false);
    expect(chanceLeft(back)).toBeGreaterThanOrEqual(held);
    if (withChance) expect(held).toBe(MAX_STOCK - 1);
  });

  const holes: [string, number][] = BOWL.map((hole, index) => [hole === 'jackpot' ? 'the jackpot' : `${hole} medals`, index]);

  it.each(holes)('brings a ball that had dropped for %s back in the hole its way ends in, and pays nothing again', { timeout: LONG }, (_hole, hole) => {
    for (const since of [0, 1, ONE_BOWL.prize - 0.01]) {
      const save = dropped(hole, since);
      const back = restore(JSON.stringify(save), 1);
      expect(back).not.toBeNull();
      if (!back) return;
      const { bowl: oldBowl, ...run } = save.screen.roulette as Row & { bowl: Row };
      // The run is as it was written. The ball lies in the last hole of the first way down to that end, paid, for as long as it had lain.
      const way = FALLS.find((fall) => fallEnd(fall) === BOWL[hole]) ?? [];
      const stage = way.length - 1;
      expect(back.roulette).toMatchObject(run);
      expect(back.roulette?.bowl).toMatchObject({ holes: [...way], stage, duration: BOWL_TIMES[stage], payout: oldBowl.payout });
      expect(back.roulette?.bowl?.elapsed).toBeCloseTo(BOWL_TIMES[stage] + since, 9);
      expect(BOWLS[stage][way[stage]]).toBe(BOWL[hole]);
      expect(serialize(restore(serialize(back), 1) as Session)).toBe(serialize(back));
      // It is paid already, and is not paid again: the prize stays up for the rest of its time and goes.
      const { paidOut, jackpots, jackpot } = back;
      const before = medalsOnField(back.machine) + back.won + back.lost;
      const events: SessionEvent[] = [];
      for (let i = 0; i < 60 * 10 && back.roulette; i++) advance(back, DT, events);
      expect(back.roulette).toBeNull();
      expect(events.filter((event) => event.type === 'bowlEnd' || event.type === 'bowlDrop' || event.type === 'bowlStart')).toEqual([]);
      expect([back.paidOut, back.jackpots, back.jackpot]).toEqual([paidOut, jackpots, jackpot]);
      expect(medalsOnField(back.machine) + back.won + back.lost).toBe(before);
    }
  });

  // That version's ball is held to that version's shape and to that game's moments: one thing changed, and the roulette is no roulette of either.
  const spoiled: [string, (run: Row, bowl: Row) => void][] = [
    ['a ball in today’s three bowls', (run, bowl) => (run.bowl = { holes: [...FALLS[TO_JACKPOT]], stage: 0, elapsed: bowl.elapsed, duration: BOWL_TIMES[0], payout: -1 })],
    ['a hole that bowl did not have', (_run, bowl) => (bowl.hole = BOWL.length)],
    ['a ball still rolling at the moment it drops', (_run, bowl) => (bowl.elapsed = bowl.duration)],
    ['a ball that rolls for as long as today’s middle bowl takes', (_run, bowl) => (bowl.duration = BOWL_TIMES[1])],
    ['a ball that has dropped while it rolls', (_run, bowl) => (bowl.payout = 50)],
    ['a bowl with the field of today’s', (_run, bowl) => (bowl.stage = 0)],
    ['a bowl with no hole drawn', (_run, bowl) => delete bowl.hole],
    ['a ball in the bowl after a run one number short', (run) => (run.level = CHAIN_GOAL - 1)],
    ['a ball in the bowl with the run ended', (run) => (run.over = true)],
  ];

  it.each(spoiled)('given %s, loses its roulette, keeps the machine and gets the ball back', (_what, spoil) => {
    const save = changed(spoil);
    const back = restore(JSON.stringify(save), 1);
    expect(back).not.toBeNull();
    expect(back?.roulette).toBeNull();
    expect(plain(back as Session)).toEqual(leftOff(save));
    expect(back?.balls).toBe((old().session.balls as number) + 1);
    // The gold spins it held are still held, and still gold.
    expect(chanceLeft(back as Session)).toBe(withChance ? old().session.gold : 0);
  });

  it('does not keep a prize up for longer than that game did, nor a prize that game never paid', () => {
    for (const hole of [0, 1, 2]) {
      expect(restore(JSON.stringify(dropped(hole, ONE_BOWL.prize - 0.01)), 1)?.roulette).not.toBeNull();
      const late = dropped(hole, ONE_BOWL.prize);
      expect(restore(JSON.stringify(late), 1)?.roulette).toBeNull();
      expect(plain(restore(JSON.stringify(late), 1) as Session)).toEqual(leftOff(late));
    }
    // The hole for fifty holding a hundred, a jackpot smaller than one starts at, and a jackpot's hole that is not called one.
    const wrong: ((run: Row, bowl: Row) => void)[] = [
      (run, bowl) => {
        bowl.payout = 100;
        Object.assign(run, { gain: 100, total: RUN + 100 });
      },
      (run) => (run.jackpot = true),
    ];
    for (const change of wrong) {
      const save = dropped(BOWL.indexOf(50), 1);
      change(save.screen.roulette as Row, (save.screen.roulette as Row).bowl as Row);
      expect(restore(JSON.stringify(save), 1)?.roulette).toBeNull();
    }
    const small = dropped(BOWL.indexOf('jackpot'), 1);
    Object.assign((small.screen.roulette as Row).bowl as Row, { payout: JACKPOT_START - 1 });
    Object.assign(small.screen.roulette as Row, { gain: JACKPOT_START - 1, total: RUN + JACKPOT_START - 1 });
    expect(restore(JSON.stringify(small), 1)?.roulette).toBeNull();
  });

  it('is a save of its own version and of no other', () => {
    // Called a save of this version it is no save at all: it has neither the jewel lamps among its numbers nor the
    // two the lucky lamp added. Nor is it one of the versions that had jewels and no lucky lamp.
    for (const later of [STORAGE_VERSION, VERSION_BEFORE_LAMP, VERSION_BEFORE_WORKS]) expect(restore(JSON.stringify({ ...old(), version: later }), 1)).toBeNull();
    // Called a save of the version with three bowls. With chance time's numbers it is a machine of that version
    // whose one bowl is no ball of that version's: the roulette goes and the ball comes back. Without them it is no save at all.
    const renumbered = old();
    renumbered.version = VERSION_BEFORE_JEWELS;
    const back = restore(JSON.stringify(renumbered), 1);
    if (withChance) {
      expect(back?.roulette).toBeNull();
      expect(plain(back as Session)).toEqual(leftOff(renumbered));
      expect(back).toMatchObject({ lucky: 0, rush: true, gold: old().session.gold });
    } else {
      expect(back).toBeNull();
    }
    // Given the lamp's two numbers under its own version, it is not that version's save either.
    for (const extra of [{ lucky: 0 }, { rush: false }, { lucky: 0, rush: false }]) {
      const given = old();
      Object.assign(given.session, extra);
      expect(restore(JSON.stringify(given), 1)).toBeNull();
    }
    // Called the other version that had one bowl, its numbers are not that version's numbers.
    const other = old();
    other.version = withChance ? VERSION_BEFORE_CHANCE : VERSION_WITH_ONE_BOWL;
    expect(restore(JSON.stringify(other), 1)).toBeNull();
    // Nor is its field the field of the versions before the arms had an aim each.
    for (const older of [VERSION_WITH_ONE_AIM, VERSION_BEFORE_ARMS]) {
      const save = old();
      save.version = older;
      expect(restore(JSON.stringify(save), 1)).toBeNull();
    }
    // Given chance time's numbers, or stripped of them, it is still not the other version's save under its own number.
    const mixed = old();
    if (withChance) for (const key of CHANCE_NUMBERS) delete mixed.session[key];
    else Object.assign(mixed.session, { gold: 0, gilded: 0, chance: false });
    expect(restore(JSON.stringify(mixed), 1)).toBeNull();
  });

  it('is the bowl of every version before the three bowls, whatever that version’s field and numbers were', () => {
    // Every version before the three bowls had the same one bowl. The other fixtures were caught at other moments,
    // so each is given this one's roulette, its ball rolling and its ball dropped.
    const older: [number, string][] = [
      [VERSION_BEFORE_ARMS, beforeArms.save],
      [VERSION_WITH_ONE_AIM, beforeLeftAndRight.save],
      [VERSION_BEFORE_CHANCE, beforeChanceTime.save],
      [VERSION_BEFORE_CHANCE, beforeThreeBowls.save],
      [VERSION_WITH_ONE_BOWL, withChanceAndOneBowl.save],
    ];
    for (const [written, text] of older) {
      for (const roulette of [old().screen.roulette, dropped(1, 0.5).screen.roulette, dropped(0, 0.5).screen.roulette]) {
        const save = JSON.parse(text) as Save;
        expect(save.version).toBe(written);
        save.screen = { spin: null, bonus: null, roulette };
        const back = restore(JSON.stringify(save), 1);
        expect(back, `version ${written}`).not.toBeNull();
        const { bowl, ...run } = roulette as Row & { bowl: Row };
        expect(back?.roulette).toMatchObject(run);
        const way = FALLS.find((fall) => fallEnd(fall) === BOWL[bowl.hole as number]) ?? [];
        expect(back?.roulette?.bowl).toMatchObject({ holes: [...way], stage: (bowl.payout as number) < 0 ? 0 : way.length - 1, payout: bowl.payout });
        // Written again it is a save of this version, with the ball in today's bowls.
        const again = JSON.parse(serialize(back as Session)) as Save;
        expect(again.version).toBe(STORAGE_VERSION);
        expect((again.screen.roulette as Row).bowl).toHaveProperty('holes');
        expect(restore(JSON.stringify(again), 1)?.roulette).toEqual(back?.roulette);
      }
    }
  });
});

describe('garbage', () => {
  it('is refused without throwing, whatever it is', () => {
    const random = seededRng(2024);
    const pieces = ['{', '}', '[', ']', '"', ':', ',', '-', '.', 'e', '0', '1', '9', ' ', 'null', 'true', 'false', '\\', 'u', '"medals"', '"version"', '"machine"', '\n'];
    for (let i = 0; i < 3000; i++) {
      let text = '';
      const length = Math.floor(random() * 60);
      for (let j = 0; j < length; j++) text += pieces[Math.floor(random() * pieces.length)];
      expect(restore(text, 1)).toBeNull();
    }
  });

  it('is refused when it is well-formed JSON of any shape', () => {
    const random = seededRng(7);
    const names = ['version', 'machine', 'session', 'screen', 'medals', 'falling', 'spin', 'tiers', '__proto__', 'constructor', 'toString', 'length', 'x'];
    const leaves = [null, true, false, 0, 1, -1, 0.5, 1e21, -1e-7, '', 'medal', '1', [], {}, STORAGE_VERSION];
    const any = (depth: number): unknown => {
      const roll = random();
      if (depth === 0 || roll < 0.4) return leaves[Math.floor(random() * leaves.length)];
      if (roll < 0.6) return Array.from({ length: Math.floor(random() * 4) }, () => any(depth - 1));
      const entries: string[] = [];
      const count = Math.floor(random() * 5);
      for (let i = 0; i < count; i++) entries.push(`${JSON.stringify(names[Math.floor(random() * names.length)])}:${JSON.stringify(any(depth - 1))}`);
      return JSON.parse(`{${entries.join(',')}}`);
    };
    for (let i = 0; i < 2000; i++) {
      // The top of every one is an object carrying the right version, so the checks below it are reached.
      const text = JSON.stringify({ version: STORAGE_VERSION, machine: any(4), session: any(4), screen: any(3) });
      expect(restore(text, 1)).toBeNull();
    }
  });

  it('either refuses a good save with one thing changed, or gives a machine that runs', { timeout: LONG }, () => {
    const random = seededRng(99);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
    const junk: unknown[] = [null, true, false, -1, 0, 1, 2, 3, 7, 25, 26, 99, 101, 0.5, -0.5, 0.1, 1e5, 1e15, '', '0', 'chest', [], {}, [1, 2, 3]];
    // A machine in play with a roulette on its screen, a ball's turn having come round, and spins held behind it.
    const start = serialize((() => {
      const session = played(31, 6);
      session.balls = 1;
      for (let i = 0; i < 60 * 30 && !session.roulette; i++) advance(session, DT);
      session.stock = 2;
      return session;
    })());
    expect(JSON.parse(start).screen.roulette).not.toBeNull();

    let refused = 0;
    let ran = 0;
    for (let i = 0; i < 1500; i++) {
      const save = JSON.parse(start);
      // Walk down to somewhere in the save and change what is there, take it out, or add to it.
      let node: Record<string, unknown> | unknown[] = save;
      for (let depth = 0; depth < 4; depth++) {
        const keys = Object.keys(node);
        if (keys.length === 0) break;
        const key = pick(keys);
        const next = (node as Record<string, unknown>)[key];
        if (typeof next === 'object' && next !== null && random() < 0.8) {
          node = next as Record<string, unknown> | unknown[];
          continue;
        }
        const what = random();
        if (what < 0.75) (node as Record<string, unknown>)[key] = pick(junk);
        else if (what < 0.9) delete (node as Record<string, unknown>)[key];
        else (node as Record<string, unknown>)[`${key}2`] = pick(junk);
        break;
      }
      const back = restore(JSON.stringify(save), i);
      if (!back) {
        refused++;
        continue;
      }
      ran++;
      for (let step = 0; step < 40; step++) {
        if (step % 10 === 0) insertAt(back, 20 + step);
        advance(back, DT);
      }
      expect(everyPosition(back).every(Number.isFinite)).toBe(true);
      expect(Number.isSafeInteger(back.credits)).toBe(true);
      expect(restore(serialize(back), 1)).not.toBeNull();
    }
    // Most changes spoil the save; the ones that do not leave a machine that plays.
    expect(refused).toBeGreaterThan(300);
    expect(ran).toBeGreaterThan(50);
  });
});

describe('a save written when the arms were short and a fed medal went straight onto its rail', () => {
  // Written by the game as it was before the arms were made to run back from slots at the front corners, with
  // that version's own `serialize`: see the fixture's `about`. It is a save of the same version as today's: the
  // shape of a save has not changed, only how long a fed medal is on its way, and so how large its `remaining` can be.
  const OLD = beforeSlots.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = beforeSlots;
  const total = (events: SessionEvent[], type: 'landed' | 'won' | 'lost'): number =>
    events.reduce((sum, event) => sum + (event.type === type ? event.count : 0), 0);

  it('is a save of the version before this one, caught with three medals part of the way down a rail', () => {
    const save = old();
    expect(save.version).toBe(VERSION_WITH_ONE_AIM);
    const rolling = save.machine.rolling as { id: number; arm: number; remaining: number }[];
    expect(rolling).toHaveLength(3);
    // Each had at most the old half second to go, and they are a slot's wait apart: the first fed the furthest down.
    for (const medal of rolling) expect(medal.remaining).toBeLessThanOrEqual(0.5);
    expect(rolling[1].remaining - rolling[0].remaining).toBeCloseTo(12 * DT, 9);
    expect(rolling[2].remaining - rolling[1].remaining).toBeCloseTo(12 * DT, 9);
    expect(save.machine.falling.filter((medal) => medal.source === 'player').length).toBeGreaterThanOrEqual(1);
    expect(save.machine.cooldown).toBeGreaterThan(0);
    expect(save.session.inserted).toBeGreaterThan(100);
  });

  it('reads back as the same machine to the last digit, every medal on a rail still on its rail', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    // Nothing is added, dropped or changed but the shape the arms are written in: written again, it is that text
    // with each arm given the one aim and each slot the one wait.
    expect(serialize(back)).toBe(writtenToday(OLD));
    expect(back.machine.rolling).toEqual(old().machine.rolling);
    // The rail's leg of the way in is longer than the whole way was then, so a medal that was on a rail is on
    // its rail now, with as long to go as it had: not back at the slot.
    expect(FEED.arm).toBeGreaterThanOrEqual(0.5);
    for (const medal of back.machine.rolling) {
      expect(legOf(medal.remaining)).toBe('arm');
      const tip = back.machine.tips[medal.arm];
      const { x, height, depth } = rollingSpot(medal.arm, tip, medal.remaining);
      expect(fedSpot(medal.arm, tip, medal.remaining)).toMatchObject({ leg: 'arm', x, height, depth });
    }
    // A save can hold more medals on their way than it could, since the way is longer.
    expect(ROLL_TIME).toBeGreaterThan(0.5);
    expect(LIMITS.rolling).toBe(2 * Math.ceil(ROLL_TIME / DROP_INTERVAL));
    expect(LIMITS.rolling).toBeGreaterThan(3);
  });

  it('plays on exactly as the game that wrote it did: each medal leaves its arm in the same step, from the same place', () => {
    const back = restore(OLD, then.seed) as Session;
    const events: SessionEvent[] = [];
    const left: { id: number; step: number; fromX: number }[] = [];
    for (let i = 0; i < then.steps; i++) {
      const before = new Set(back.machine.rolling.map((medal) => medal.id));
      advance(back, DT, events);
      for (const medal of back.machine.falling) if (before.has(medal.id)) left.push({ id: medal.id, step: i + 1, fromX: medal.fromX });
    }
    expect(left).toEqual(then.left);
    expect(left).toHaveLength(3);
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    expect(total(events, 'landed')).toBe(then.landed);
    // What starts a spin has changed since that game was written: the START pockets are on the pusher's lip now
    // (see the save from while the gates still swept the back panel, above). In these four seconds no medal went
    // through a gate then, and none drops through a pocket now, so the screen has nothing to differ about and the
    // two games agree to the last medal. What this save is here to show is the feed, and that is `left`.
    expect(then.gates).toEqual([]);
    expect(events.flatMap((event) => (event.type === 'checker' ? [event.gate] : []))).toEqual(then.gates);
    expect(total(events, 'won')).toBe(then.won);
    expect(total(events, 'lost')).toBe(then.lost);
    expect([back.credits, back.hits, back.stock, back.spins, back.paidOut]).toEqual([then.credits, then.hits, then.stock, then.spins, then.paidOut]);
    expect(back.machine.medals).toHaveLength(then.medals);
    expect([back.machine.rolling.length, back.machine.falling.length]).toEqual([then.rolling, then.falling]);
    // And each of the medals that was on its way then lies where that game's machine left it, to within a
    // third of a medal's radius. It was to the last digit until the towers had lifts: a prize of ten comes up
    // as a tower in these four seconds, and a tower in its guard is not leant aside by its neighbours as that
    // game's was. They give way to it instead, which moves the medals round it by a fraction of a unit.
    expect(then.resting).toHaveLength(5);
    expect(back.machine.medals.filter((m) => m.stack === 10)).toHaveLength(1);
    for (const rest of then.resting) {
      const medal = back.machine.medals.find((m) => m.id === rest.id);
      expect(medal).toMatchObject({ level: rest.level, tier: rest.tier });
      expect(Math.hypot((medal?.x ?? NaN) - rest.x, (medal?.y ?? NaN) - rest.y)).toBeLessThan(MEDAL_RADIUS / 3);
    }
  });

  it('feeds the next medal at the slot, behind the ones it was saved with', () => {
    const back = restore(OLD, then.seed) as Session;
    const saved = back.machine.rolling.map((medal) => medal.id);
    while (!insert(back, 0)) advance(back, DT);
    const fed = back.machine.rolling[back.machine.rolling.length - 1];
    expect(saved).not.toContain(fed.id);
    expect(fed.remaining).toBe(ROLL_TIME);
    expect(legOf(fed.remaining)).toBe('slot');
    // The save still reads with it on board, and the medals ahead of it leave first.
    expect(restore(serialize(back), 1)).not.toBeNull();
    for (let i = 0; i < Math.round(FEED.arm / DT); i++) advance(back, DT);
    expect(back.machine.rolling.map((medal) => medal.id)).toEqual([fed.id]);
    expect(legOf(back.machine.rolling[0].remaining)).toBe('arm');
  });

  it('is not taken for a machine once a medal on a rail has longer to go than the whole way in', () => {
    const tooLong = old();
    (tooLong.machine.rolling as { remaining: number }[])[2].remaining = ROLL_TIME + 0.01;
    expect(restore(JSON.stringify(tooLong), 1)).toBeNull();
    // As long as the whole way is fine in itself, but not for a medal with two more behind it that were fed after it.
    const first = old();
    (first.machine.rolling as { remaining: number }[])[0].remaining = ROLL_TIME;
    expect(restore(JSON.stringify(first), 1)).toBeNull();
  });
});

describe('a save written before chance time', () => {
  // Written by the game as it was the day before chance time, with that day's own `serialize`: see the fixture's `about`.
  const OLD = beforeChanceTime.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = beforeChanceTime;

  it('is a save of version 3: the hold full, medals wasted on it, and no word of gold', () => {
    const save = old();
    expect(save.version).toBe(VERSION_BEFORE_CHANCE);
    expect(save.version).not.toBe(STORAGE_VERSION);
    for (const key of ['gold', 'gilded', 'chance']) expect(save.session).not.toHaveProperty(key);
    expect(save.session.stock).toBe(MAX_STOCK);
    expect(save.session.wasted).toBeGreaterThan(50);
    // A roll on the board is on its screen and has not paid yet, and both rails have medals on them.
    expect(save.screen.bonus).toMatchObject({ kind: 'sugoroku', payout: -1 });
    expect(new Set(save.machine.rolling.map((medal) => medal.arm)).size).toBe(2);
    // Its field is today's field but for the payout works, which came after it.
    expect(Object.keys(withWorks(save.machine)).sort()).toEqual(Object.keys(JSON.parse(serialize(createSession(1))).machine).sort());
    for (const key of ['hopper', 'lifts']) expect(save.machine).not.toHaveProperty(key);
  });

  it('reads back as the same machine, with none of its held spins gold', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    // That game had no gold spins: what it wasted on the full hold stays wasted, and chance time has not begun.
    expect([back.gold, back.gilded, back.lucky, back.rush, back.chance]).toEqual([0, 0, 0, false, false]);
    expect(chanceLeft(back)).toBe(0);
    expect([back.stock, back.wasted]).toEqual([save.session.stock, save.session.wasted]);
    // Everything else is what was written, to the last digit, with the payout works at rest.
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(withWorks(save.machine)));
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersToday(save.session)));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    expect(text).toBe(writtenToday(OLD));
    const again = JSON.parse(text) as Save;
    expect(again.version).toBe(STORAGE_VERSION);
    expect(again.session).toMatchObject({ gold: 0, gilded: 0, lucky: 0, rush: false, chance: false });
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('plays on by today’s rule: the next medal to find its hold full turns a held spin gold, and chance time begins', () => {
    const back = restore(OLD, then.seed) as Session;
    const at = { hits: back.hits, spins: back.spins, stock: back.stock, wasted: back.wasted };
    const events: SessionEvent[] = [];
    for (let i = 0; i < then.steps; i++) advance(back, DT, events);
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    // Then, the medals that went through a pocket in these twelve seconds all found the hold full and were wasted.
    expect(then.pockets.length).toBeGreaterThan(0);
    expect(then.pockets.every((pocket) => !pocket.held)).toBe(true);
    // Now the first of them goes through the same pocket, which is a narrower slot than it was and still in line
    // with this medal, and turns a held spin gold. With that chance time begins and the wings open. They open less
    // wide than the pockets were: of the others, those that come over inside them go through, in the order they did
    // then, and the rest slide by.
    const pockets = events.flatMap((event) => (event.type === 'checker' ? [event] : []));
    expect(pockets[0]).toEqual({ type: 'checker', gate: then.pockets[0].pocket, held: false, gold: true, lucky: false });
    expect(events.filter((event) => event.type === 'chanceStart')).toHaveLength(1);
    const began = events.findIndex((event) => event.type === 'chanceStart');
    expect(began).toBeGreaterThan(events.indexOf(pockets[0]));
    expect(began).toBeLessThan(events.indexOf(pockets[1]));
    expect(CHECKERS.wingWidth).toBeLessThan(POCKET_THEN);
    expect(pockets.length).toBeGreaterThanOrEqual(2);
    expect(
      someOf(
        pockets.map((event) => event.gate),
        then.pockets.map(({ pocket }) => pocket),
      ),
    ).toBe(true);
    // With wings as wide as that game's pockets, every one of them goes through as it did then.
    const wide = withWings(POCKET_THEN, () => {
      const again = restore(OLD, then.seed) as Session;
      const said: SessionEvent[] = [];
      for (let i = 0; i < then.steps; i++) advance(again, DT, said);
      return said.flatMap((event) => (event.type === 'checker' ? [event.gate] : []));
    });
    expect(wide).toEqual(then.pockets.map(({ pocket }) => pocket));
    expect(back.gilded).toBe(pockets.filter((event) => event.gold).length);
    expect(back.gilded).toBeGreaterThanOrEqual(1);
    expect(back.lucky).toBe(pockets.filter((event) => event.lucky).length);
    // The roll that was on its screen came from an ordinary spin, and pays what its square holds, once.
    expect(events.flatMap((event) => (event.type === 'sugorokuEnd' ? [{ square: event.square, payout: event.payout }] : []))[0]).toEqual(then.square[0]);
    expect(then.square[0].payout).toBe(BOARD[then.square[0].square]);
    // Gold spins are quick, so it has played at least as many spins as it did then, and the books still balance.
    expect(back.spins).toBeGreaterThanOrEqual(then.spins);
    expect(back.hits - at.hits).toBe(back.spins - at.spins + (back.stock - at.stock) + (back.wasted - at.wasted));
    expect(back.gold).toBeLessThanOrEqual(back.stock);
    expect(everyPosition(back).every(Number.isFinite)).toBe(true);
    expect(plain(reread(back))).toEqual(plain(back));
  });

  // That version's numbers are held to that version's shape.
  const spoilt: [string, (save: Save) => void][] = [
    ['called a save of this version', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of the version before it', (save) => (save.version = VERSION_WITH_ONE_AIM)],
    ['given gold spins, which that game did not have', (save) => (save.session.gold = 0)],
    ['given all three of chance time’s numbers, under its old version', (save) => Object.assign(save.session, { gold: 0, gilded: 0, chance: false })],
    ['given the lamp’s count of gold spins, which that game did not have', (save) => (save.session.lucky = 0)],
    ['given all five of today’s numbers for gold spins, under its old version', (save) => Object.assign(save.session, { gold: 0, gilded: 0, lucky: 0, rush: false, chance: false })],
    ['left without its count of wasted medals', (save) => delete save.session.wasted],
    ['holding more spins than the hold has room for', (save) => (save.session.stock = MAX_STOCK + 1)],
  ];

  it.each(spoilt)('is refused when it is %s', (_name, spoil) => {
    const save = old();
    spoil(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });
});

describe('a save written in chance time before the lucky lamp, the jewels and the payout works', () => {
  // Written by the game as it was before the START slots were narrowed and given a lucky lamp and wings, with that
  // version's own `serialize`: see the fixture's `about`. That game had the three bowls and chance time, and neither
  // jewels nor the payout works: its version is the fifth. The game the day before the lamp, which had both, is in
  // the describe after this one.
  const OLD = beforeLamp.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = beforeLamp;
  const NOTHING = { spin: null, bonus: null, roulette: null };

  it('is a save of version 5: in chance time, the hold full and all but one of its spins gold, a gold spin on the reels, and no word of the lamp', () => {
    const save = old();
    expect(save.version).toBe(VERSION_BEFORE_JEWELS);
    expect(save.version).toBe(5);
    expect(save.version).not.toBe(STORAGE_VERSION);
    for (const key of LAMP_NUMBERS) expect(save.session).not.toHaveProperty(key);
    // Its numbers are today's but for those two and the jewel lamps, in today's order; its field is today's but for
    // the payout works; and its screen is today's.
    const today = JSON.parse(serialize(createSession(1))) as Save;
    expect(Object.keys(save.session)).toEqual(Object.keys(today.session).filter((key) => !LAMP_NUMBERS.includes(key) && key !== 'jewels' && key !== 'jewelBonuses'));
    expect(Object.keys(numbersWithLamp(save.session))).toEqual(Object.keys(today.session));
    for (const key of ['hopper', 'lifts']) expect(save.machine).not.toHaveProperty(key);
    expect(Object.keys(withWorks(save.machine))).toEqual(Object.keys(today.machine));
    expect([...save.machine.medals, ...save.machine.falling].some((medal) => 'jewel' in medal)).toBe(false);
    expect(save.session).toMatchObject({ stock: MAX_STOCK, gold: MAX_STOCK - 1, gilded: MAX_STOCK, chance: true });
    expect(save.session.wasted as number).toBeGreaterThan(MAX_STOCK);
    const spin = save.screen.spin as { duration: number; done: boolean; result: SpinResult };
    expect(spin.done).toBe(false);
    expect(spin.duration).toBe(TIMING.chanceSpin + reachTime(spin.result));
    expect(new Set(save.machine.rolling.map((medal) => medal.arm)).size).toBe(2);
    expect(medalsOnField({ ...save.machine, rng: Math.random } as unknown as Session['machine'])).toBe(then.onField);
  });

  it('reads back as the same machine, none of its gold spins the lamp’s, and in chance time as it was', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    // That game had no lit slot: none of its gold spins was gold from the start. And it was in chance time, with
    // gold spins held and one on its reels, so it is in chance time now, and its wings are open.
    expect([back.lucky, back.rush]).toEqual([0, true]);
    expect([back.stock, back.gold, back.gilded, back.chance]).toEqual([save.session.stock, save.session.gold, save.session.gilded, true]);
    expect(chanceLeft(back)).toBe(MAX_STOCK);
    // Everything else is what was written, to the last digit, with the payout works at rest: no tower was going up,
    // so no lift is at work. No jewel is laid on a machine that was already in play, and no jewel lamp is lit.
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(withWorks(save.machine)));
    expect([back.machine.hopper, back.machine.lifts]).toEqual([shutHopper(), []]);
    expect([jewelsOnField(back.machine), back.jewels, back.jewelBonuses]).toEqual([0, 0, 0]);
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersWithLamp(save.session)));
    expect(JSON.stringify(numbers)).toBe(JSON.stringify({ ...numbersWithLamp(save.session), lucky: 0, rush: true }));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    // The same text but for the version's number, the payout works at rest in its field, and the numbers it lacked
    // where a session holds them: the two the lamp added, and the jewel lamps.
    expect(text).toBe(JSON.stringify({ ...old(), version: STORAGE_VERSION, machine: withWorks(old().machine), session: numbersWithLamp(old().session) }));
    const again = JSON.parse(text) as Save;
    expect(again.version).toBe(STORAGE_VERSION);
    expect(again.session).toMatchObject({ lucky: 0, rush: true });
    expect(Object.keys(again.session)).toEqual(Object.keys(JSON.parse(serialize(createSession(1))).session));
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('plays on in chance time by today’s rule: the medals inside today’s wings count, and each one that is held holds a gold spin', () => {
    /** Twelve seconds of it with nobody feeding, and what the screen was told of its slots. What is true however wide the wings open is checked here. */
    const playOn = () => {
      const back = restore(OLD, then.seed) as Session;
      const at = { won: back.won, lost: back.lost, hits: back.hits, spins: back.spins, stock: back.stock, wasted: back.wasted, gilded: back.gilded };
      expect(medalsOnField(back.machine)).toBe(then.onField);
      const events: SessionEvent[] = [];
      for (let i = 0; i < then.steps; i++) advance(back, DT, events);
      expect(back.machine.time).toBeCloseTo(then.time, 9);
      // The field is that game's field: as many medals over the front and off the sides, and as many left lying. What
      // a slot counts moves no medal, and the screen paid nothing in these twelve seconds, then or now.
      expect([back.won - at.won, back.lost - at.lost, medalsOnField(back.machine)]).toEqual([then.won, then.lost, then.onFieldAfter]);
      expect(back.paidOut).toBe(then.paidOut);
      const pockets = events.flatMap((event) => (event.type === 'checker' ? [event] : []));
      // Then, a medal that was held held an ordinary spin. Now it holds a gold one, as every medal does while chance time lasts.
      expect(pockets.every((event) => event.lucky === event.held)).toBe(true);
      expect(back.lucky).toBe(pockets.filter((event) => event.held).length);
      // The first to find the hold full turned the last ordinary spin gold, then and now.
      expect(then.pockets[0]).toEqual({ pocket: pockets[0].gate, held: false, gold: true });
      expect(pockets[0]).toMatchObject({ held: false, gold: true, lucky: false });
      expect(back.gilded - at.gilded).toBe(pockets.filter((event) => event.gold).length);
      // No chance time began, since it was chance time already, and the books still balance.
      expect(events.filter((event) => event.type === 'chanceStart')).toEqual([]);
      expect(back.gold).toBeLessThanOrEqual(back.stock);
      expect(back.hits - at.hits).toBe(back.spins - at.spins + (back.stock - at.stock) + (back.wasted - at.wasted));
      expect(everyPosition(back).every(Number.isFinite)).toBe(true);
      expect(plain(reread(back))).toEqual(plain(back));
      return { back, events, pockets };
    };
    expect(then.pockets.filter((pocket) => pocket.held).every((pocket) => !pocket.gold)).toBe(true);

    // With the wings as wide as that game's pockets were, the same medals go through the same slots, and the same ones are held.
    const wide = withWings(POCKET_THEN, playOn);
    expect(wide.pockets.map(({ gate, held }) => ({ pocket: gate, held }))).toEqual(then.pockets.map(({ pocket, held }) => ({ pocket, held })));
    expect(wide.pockets.length).toBeGreaterThanOrEqual(4);
    expect(wide.back.lucky).toBe(then.pockets.filter((pocket) => pocket.held).length);
    // The last found it full again. Then, one of the spins held meanwhile was there to turn. Now they were gold already, and it is only wasted.
    const last = wide.pockets.length - 1;
    expect(then.pockets[last]).toMatchObject({ held: false, gold: true });
    expect(wide.pockets[last]).toMatchObject({ held: false, gold: false, lucky: false });
    expect(wide.back.gilded).toBe(then.gilded - 1);
    // It was chance time throughout then, and is with those wings, with more gold spins left to play than that game had.
    expect(then.chanceEnds).toBe(0);
    expect(wide.events.filter((event) => event.type === 'chanceEnd')).toEqual([]);
    expect(wide.back.rush).toBe(true);
    expect(chanceLeft(wide.back)).toBeGreaterThan(then.chanceLeft);
    expect(wide.back.spins).toBeGreaterThanOrEqual(then.spins);

    // Today's wings open less wide than that. The medals that go through a slot now are some of those that did
    // then, in the order they did: the ones that came over inside today's wings. The first of them is one, which
    // the narrow slot itself takes, and at least one more is, which is held.
    expect(CHECKERS.wingWidth).toBeGreaterThan(CHECKERS.halfWidth);
    expect(CHECKERS.wingWidth).toBeLessThan(POCKET_THEN);
    const now = playOn();
    expect(
      someOf(
        now.pockets.map((event) => event.gate),
        then.pockets.map(({ pocket }) => pocket),
      ),
    ).toBe(true);
    expect(now.pockets.length).toBeLessThanOrEqual(then.pockets.length);
    expect(now.pockets.filter((event) => event.held).length).toBeGreaterThanOrEqual(1);
  });

  it('is in chance time exactly when one of its spins is gold: that is what chance time was then', () => {
    // The same machine with its gold spins played and nothing on its screen. It has turned eight spins gold, and that does not make it chance time.
    const played = old();
    Object.assign(played.session, { gold: 0, chance: false });
    played.screen = { ...NOTHING };
    expect(restore(JSON.stringify(played), 1)).toMatchObject({ rush: false, lucky: 0, gold: 0, gilded: MAX_STOCK, chance: false, spin: null });
    // With gold spins held and none on the screen, it is.
    const held = old();
    held.session.chance = false;
    held.screen = { ...NOTHING };
    expect(restore(JSON.stringify(held), 1)).toMatchObject({ rush: true, lucky: 0, gold: MAX_STOCK - 1, chance: false });
    // With none held and the last of them on the reels, it is.
    const reels = old();
    reels.session.gold = 0;
    expect(restore(JSON.stringify(reels), 1)).toMatchObject({ rush: true, lucky: 0, gold: 0, chance: true });
    expect(restore(JSON.stringify(reels), 1)?.spin).not.toBeNull();
    // And if that last spin's screen has gone wrong, the spin is left off with its gold, and chance time is over with it.
    (reels.screen.spin as Row).duration = TIMING.spin + reachTime((reels.screen.spin as { result: SpinResult }).result);
    expect(restore(JSON.stringify(reels), 1)).toMatchObject({ rush: false, gold: 0, chance: false, spin: null, gilded: MAX_STOCK });
  });

  // That version's numbers are held to that version's shape.
  const spoilt: [string, (save: Save) => void][] = [
    ['called a save of this version, which has two numbers it lacks', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of the version before the lamp, which had jewels and the payout works', (save) => (save.version = VERSION_BEFORE_LAMP)],
    ['called a save of the version before the payout works, which had jewels', (save) => (save.version = VERSION_BEFORE_WORKS)],
    ['called a save of the version before chance time', (save) => (save.version = VERSION_BEFORE_CHANCE)],
    ['called a save of the version before the arms had an aim each', (save) => (save.version = VERSION_WITH_ONE_AIM)],
    ['given the lamp’s count of gold spins, which that game did not have', (save) => (save.session.lucky = 0)],
    ['told whether it is in chance time, which that game did not write down', (save) => (save.session.rush = true)],
    ['given both of the lamp’s numbers, under its old version', (save) => Object.assign(save.session, { lucky: 0, rush: true })],
    ['given both of the lamp’s numbers where a session holds them', (save) => (save.session = numbersWithLamp(save.session) as Save['session'])],
    ['holding more gold spins than its full hold has turned', (save) => (save.session.gilded = MAX_STOCK - 1)],
    ['holding more gold spins than spins', (save) => (save.session.stock = MAX_STOCK - 2)],
    ['left without its count of gold spins', (save) => delete save.session.gold],
    ['left without its count of the spins it has turned gold', (save) => delete save.session.gilded],
    ['left without a word of whether its screen is gold', (save) => delete save.session.chance],
  ];

  it.each(spoilt)('is refused when it is %s', (_name, spoil) => {
    const save = old();
    spoil(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });

  it('reads as a save of the version before it too, whose numbers were the same: only the ball in the bowls was written another way', () => {
    // Nothing of this save is a ball, so called version 4 it is the same machine.
    const back = restore(JSON.stringify({ ...old(), version: VERSION_WITH_ONE_BOWL }), 1);
    expect(back).not.toBeNull();
    expect(serialize(back as Session)).toBe(serialize(restore(OLD, 1) as Session));
  });
});

describe('a save written the day before the lucky lamp', () => {
  // Written by main's own `serialize` the day before the START slots were narrowed and given a lucky lamp and wings,
  // jewels and the payout works in it: see the fixture's `about`.
  const OLD = dayBeforeLamp.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = dayBeforeLamp;
  const total = (events: SessionEvent[], type: 'landed' | 'won' | 'lost'): number => events.reduce((sum, event) => sum + (event.type === type ? event.count : 0), 0);

  it('is a save of version 7: in chance time, the hold full and all but one of its spins gold, a gold spin on the reels, a tower coming up on its lift, and no word of the lamp', () => {
    const save = old();
    expect(save.version).toBe(VERSION_BEFORE_LAMP);
    expect(save.version).toBe(7);
    expect(save.version).not.toBe(STORAGE_VERSION);
    for (const key of LAMP_NUMBERS) expect(save.session).not.toHaveProperty(key);
    // Its numbers are today's but for those two, in today's order, and its field and its screen are today's.
    const today = JSON.parse(serialize(createSession(1))) as Save;
    expect(Object.keys(save.session)).toEqual(Object.keys(today.session).filter((key) => !LAMP_NUMBERS.includes(key)));
    expect(Object.keys(numbersWithLamp(save.session))).toEqual(Object.keys(today.session));
    expect(Object.keys(save.machine)).toEqual(Object.keys(today.machine));
    // Chance time as that game had it: the hold full, seven of its spins gold and the eighth gold spin on the reels,
    // a tenth of a second into them.
    expect(save.session).toMatchObject({ stock: MAX_STOCK, gold: MAX_STOCK - 1, chance: true });
    expect(save.session.gilded as number).toBeGreaterThan(MAX_STOCK);
    expect(save.session.wasted as number).toBeGreaterThanOrEqual(save.session.gilded as number);
    const spin = save.screen.spin as { elapsed: number; duration: number; done: boolean; result: SpinResult };
    expect(spin.done).toBe(false);
    expect(spin.elapsed).toBeLessThan(0.15);
    expect(spin.duration).toBe(TIMING.chanceSpin + reachTime(spin.result));
    expect([save.screen.bonus, save.screen.roulette]).toEqual([null, null]);
    // The payout works are in it, and at work: a small tower two medals short of built stands on its lift inside its
    // guard, and the hopper's doors are shut again after three pours.
    const lifts = save.machine.lifts as Lift[];
    expect(lifts).toHaveLength(1);
    expect(holds(lifts[0])).toBe(true);
    const tower = save.machine.medals.find((medal) => medal.id === lifts[0].id);
    expect(tower).toMatchObject({ stack: 1, grow: 2, level: 1 });
    expect(save.machine.growing).toBe(2);
    expect(save.machine.hopper).toEqual({ phase: 'shut', clock: 0, pours: 3, poured: 30 });
    // It has had jewels: a full set of them collected and paid for, and none on the field or lit now.
    expect(save.session).toMatchObject({ jewels: 0, jewelBonuses: 1 });
    expect([...save.machine.medals, ...save.machine.falling].some((medal) => medal.jewel === true)).toBe(false);
    // And it was caught in the middle of play, with both rails held down: medals on both of them.
    expect(new Set(save.machine.rolling.map((medal) => medal.arm)).size).toBe(2);
    expect(save.machine.rolling.length).toBeGreaterThanOrEqual(4);
    expect(save.session.inserted).toBeGreaterThan(3000);
    expect(medalsOnField({ ...save.machine, rng: Math.random } as unknown as Session['machine'])).toBe(then.onField);
  });

  it('reads back as the same machine, none of its gold spins the lamp’s, and in chance time as it was', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    // That game had no lit slot: none of its gold spins was gold from the start. And it was in chance time, with
    // gold spins held and one on its reels, so it is in chance time now, and its wings are open.
    expect([back.lucky, back.rush]).toEqual([0, true]);
    expect([back.stock, back.gold, back.gilded, back.chance]).toEqual([save.session.stock, save.session.gold, save.session.gilded, true]);
    expect(chanceLeft(back)).toBe(MAX_STOCK);
    // Everything else is what was written, to the last digit: the field with its lift at work, the numbers with
    // their jewel bonus, and the spin on the reels.
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(save.machine));
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersWithLamp(save.session)));
    expect(JSON.stringify(numbers)).toBe(JSON.stringify({ ...numbersWithLamp(save.session), lucky: 0, rush: true }));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
    expect([back.jewels, back.jewelBonuses]).toEqual([0, 1]);
    expect(back.machine.lifts.filter(holds)).toHaveLength(1);
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    // The same text but for the version's number and the two numbers the lamp added, where a session holds them.
    expect(text).toBe(JSON.stringify({ ...old(), version: STORAGE_VERSION, session: numbersWithLamp(old().session) }));
    const again = JSON.parse(text) as Save;
    expect(again.version).toBe(STORAGE_VERSION);
    expect(again.session).toMatchObject({ lucky: 0, rush: true });
    expect(Object.keys(again.session)).toEqual(Object.keys(JSON.parse(serialize(createSession(1))).session));
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('plays on exactly as the game that wrote it did: its chance time out to the last gold spin, every medal of it through a slot squarely enough for today’s wings', () => {
    const back = restore(OLD, then.seed) as Session;
    const at = { hits: back.hits, spins: back.spins, stock: back.stock, wasted: back.wasted };
    expect(medalsOnField(back.machine)).toBe(then.onField);
    const events: SessionEvent[] = [];
    const works: { step: number; event: SessionEvent }[] = [];
    let over = -1;
    for (let step = 1; step <= then.steps; step++) {
      const now: SessionEvent[] = [];
      advance(back, DT, now);
      for (const event of now) {
        if (event.type === 'pourStart' || event.type === 'pourEnd' || event.type === 'towersRise' || event.type === 'towersReady') works.push({ step, event });
        if (event.type === 'chanceEnd') over = step;
      }
      events.push(...now);
      // The wings are open for exactly as long as chance time lasts.
      expect(back.rush).toBe(over < 0);
      // A tower in its guard is where its lift is, however the medals round it are pushed.
      for (const lift of back.machine.lifts.filter(holds)) {
        const tower = back.machine.medals.find((medal) => medal.id === lift.id);
        expect(tower?.x).toBeCloseTo(lift.x, 6);
        expect(tower?.y).toBeCloseTo(pusherFront(back.machine.time) - lift.behind, 6);
      }
    }
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    // The field is that game's field: as many medals landed, over the front and off the sides, and as many left lying.
    expect([total(events, 'landed'), total(events, 'won'), total(events, 'lost'), medalsOnField(back.machine)]).toEqual([then.landed, then.won, then.lost, then.onFieldAfter]);
    // Today's wings open less wide than a pocket was. Every medal that went through one in these twelve seconds came
    // over squarely enough for today's all the same, so the same medals go through the same slots. Each of them
    // found the hold full, then and now: the first turned the last ordinary spin gold, and the rest were wasted. None
    // was held, so the lamp and the wings made no spin gold that was not gold in that game.
    expect(CHECKERS.wingWidth).toBeGreaterThan(CHECKERS.halfWidth);
    expect(CHECKERS.wingWidth).toBeLessThan(POCKET_THEN);
    const pockets = events.flatMap((event) => (event.type === 'checker' ? [event] : []));
    expect(pockets.map(({ gate, held, gold }) => ({ pocket: gate, held, gold }))).toEqual(then.pockets);
    expect(pockets.length).toBeGreaterThanOrEqual(4);
    expect(pockets.every((event) => !event.held && !event.lucky)).toBe(true);
    expect(pockets.map((event) => event.gold)).toEqual([true, ...pockets.slice(1).map(() => false)]);
    expect(back.lucky).toBe(0);
    // The same spins end the same way: the gold one on the reels is a line of three even digits, and its square on
    // the board pays twice over, which is enough to open the hopper's doors for.
    expect(events.flatMap((event) => (event.type === 'spinEnd' ? [event.result.tier] : []))).toEqual(then.lines);
    expect(then.lines[0]).toBe('small');
    expect(then.lines.slice(1).every((line) => line === 'miss')).toBe(true);
    const square = events.flatMap((event) => (event.type === 'sugorokuEnd' ? [event] : []));
    expect(square).toHaveLength(1);
    expect(square[0].payout).toBe(BOARD[square[0].square] * CHANCE.multiplier);
    expect(square[0].payout).toBe(then.paid);
    // The payout works do what they did, in the same steps: the tower that was coming up is built, and the board's
    // prize is poured.
    expect(works).toEqual(then.works);
    expect(works.map(({ event }) => event.type)).toEqual(['towersReady', 'pourStart', 'pourEnd']);
    expect(back.machine.hopper).toEqual(then.hopper);
    expect([back.machine.payoutQueue, back.machine.growing, back.machine.lifts]).toEqual([then.payoutQueue, then.growing, []]);
    // Chance time ends once, with the last gold spin, as it did then: by today's rule and by that game's.
    expect(then.chanceEnds).toBe(1);
    expect(events.filter((event) => event.type === 'chanceEnd' || event.type === 'chanceStart')).toEqual([{ type: 'chanceEnd' }]);
    expect([back.rush, chanceLeft(back), then.chanceLeft]).toEqual([false, 0, 0]);
    // And the books are that game's books, to the medal.
    expect([back.credits, back.hits, back.stock, back.spins, back.wasted, back.gold, back.gilded, back.paidOut]).toEqual([
      then.credits,
      then.hits,
      then.stock,
      then.spins,
      then.wasted,
      then.gold,
      then.gilded,
      then.paidOut,
    ]);
    expect([jewelsOnField(back.machine), back.jewels]).toEqual([then.jewelsOnField, then.lamps]);
    expect(back.hits - at.hits).toBe(back.spins - at.spins + (back.stock - at.stock) + (back.wasted - at.wasted));
    expect(everyPosition(back).every(Number.isFinite)).toBe(true);
    expect(plain(reread(back))).toEqual(plain(back));
  });

  it('holds a gold spin for every medal that is held while its chance time lasts, which is today’s rule and was not that game’s', () => {
    // The same machine with room for two more spins in its hold, as that game would have written it.
    const save = old();
    save.session.stock = MAX_STOCK - 2;
    save.session.gold = MAX_STOCK - 2;
    const back = restore(JSON.stringify(save), then.seed) as Session;
    expect(back).toMatchObject({ rush: true, lucky: 0, stock: MAX_STOCK - 2, gold: MAX_STOCK - 2 });
    const events: SessionEvent[] = [];
    for (let i = 0; i < then.steps && !events.some((event) => event.type === 'checker'); i++) advance(back, DT, events);
    // The first medal through a slot is the one that found the hold full in that game. Here it is held, and its spin is gold.
    const [first] = events.flatMap((event) => (event.type === 'checker' ? [event] : []));
    expect(first).toEqual({ type: 'checker', gate: then.pockets[0].pocket, held: true, gold: false, lucky: true });
    expect(back.lucky).toBeGreaterThanOrEqual(1);
    expect(back.rush).toBe(true);
    expect(serialize(reread(back))).toBe(serialize(back));
  });

  it('is in chance time exactly when one of its spins is gold: that is what chance time was then', () => {
    const NOTHING = { spin: null, bonus: null, roulette: null };
    // The same machine with its gold spins played and nothing on its screen. It has turned many spins gold, and that does not make it chance time.
    const played = old();
    Object.assign(played.session, { gold: 0, chance: false });
    played.screen = { ...NOTHING };
    expect(restore(JSON.stringify(played), 1)).toMatchObject({ rush: false, lucky: 0, gold: 0, gilded: played.session.gilded, chance: false, spin: null });
    // With gold spins held and none on the screen, it is.
    const held = old();
    held.session.chance = false;
    held.screen = { ...NOTHING };
    expect(restore(JSON.stringify(held), 1)).toMatchObject({ rush: true, lucky: 0, gold: MAX_STOCK - 1, chance: false });
    // With none held and the last of them on the reels, it is.
    const reels = old();
    reels.session.gold = 0;
    expect(restore(JSON.stringify(reels), 1)).toMatchObject({ rush: true, lucky: 0, gold: 0, chance: true });
    expect(restore(JSON.stringify(reels), 1)?.spin).not.toBeNull();
    // And if that last spin's screen has gone wrong, the spin is left off with its gold, and chance time is over with it.
    (reels.screen.spin as Row).duration = TIMING.spin + reachTime((reels.screen.spin as { result: SpinResult }).result);
    expect(restore(JSON.stringify(reels), 1)).toMatchObject({ rush: false, gold: 0, chance: false, spin: null });
  });

  // That version's numbers and its field are held to that version's shape.
  const spoilt: [string, (save: Save) => void][] = [
    ['called a save of this version, which has two numbers it lacks', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of the version before the payout works, which had no doors or lifts', (save) => (save.version = VERSION_BEFORE_WORKS)],
    ['called a save of the version before jewels', (save) => (save.version = VERSION_BEFORE_JEWELS)],
    ['called a save of the version before chance time', (save) => (save.version = VERSION_BEFORE_CHANCE)],
    ['given the lamp’s count of gold spins, which that game did not have', (save) => (save.session.lucky = 0)],
    ['told whether it is in chance time, which that game did not write down', (save) => (save.session.rush = true)],
    ['given both of the lamp’s numbers, under its old version', (save) => Object.assign(save.session, { lucky: 0, rush: true })],
    ['given both of the lamp’s numbers where a session holds them', (save) => (save.session = numbersWithLamp(save.session) as Save['session'])],
    ['holding more gold spins than its full hold has turned', (save) => (save.session.gilded = MAX_STOCK - 1)],
    ['holding more gold spins than spins', (save) => (save.session.stock = MAX_STOCK - 2)],
    ['left without its count of gold spins', (save) => delete save.session.gold],
    ['left without its jewel lamps', (save) => delete save.session.jewels],
    ['left without its lifts', (save) => delete save.machine.lifts],
  ];

  it.each(spoilt)('is refused when it is %s', (_name, spoil) => {
    const save = old();
    spoil(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });
});

describe('chance time and the lucky lamp in a save', () => {
  /**
   * A machine taken from play at the first moment `when` says. Both rails are held down from the start, and for
   * good unless `enough` says when to let go of them: from then on nothing is fed.
   */
  const caught = (when: (session: Session) => boolean, enough: (session: Session) => boolean = () => false): Session => {
    const session = createSession(20261014, { balls: 0 });
    let feeding = true;
    for (let i = 0; i < 150 * 60 && !when(session); i++) {
      if (feeding && enough(session)) feeding = false;
      if (session.credits === 0) refill(session);
      if (feeding) {
        insert(session, 0);
        insert(session, 1);
      }
      advance(session, DT);
    }
    if (!when(session)) throw new Error('no such moment');
    return session;
  };
  const AT: Record<string, () => Session> = {
    // The lamp alone: a medal has been held through the lit slot, and no medal has found the hold full.
    'a spin held gold by the lucky lamp': () => caught((session) => session.lucky >= 1 && session.gold >= 1 && !session.rush && !session.chance),
    'the lamp’s gold spin on the reels': () =>
      caught(
        (session) => session.chance && !session.rush && session.spin !== null && !session.spin.done,
        (session) => session.lucky >= 1,
      ),
    // Chance time: a medal has found the hold full, the wings are open, and every medal that is held holds a gold spin.
    'chance time just begun': () => caught((session) => session.rush && session.gilded === 1),
    'every held spin gold': () => caught((session) => session.rush && session.gold === MAX_STOCK),
    'a gold spin on the reels': () => caught((session) => session.rush && session.chance && session.spin !== null && !session.spin.done && session.gold >= 2),
    'a gold spin’s roll on the board, paid': () => caught((session) => session.rush && session.chance && session.bonus?.kind === 'sugoroku' && session.bonus.payout >= 0),
    'a gold spin’s roll on the board, on its way': () => caught((session) => session.rush && session.chance && session.bonus?.kind === 'sugoroku' && session.bonus.payout < 0),
    'the last gold spin on the reels': () =>
      caught(
        (session) => session.rush && session.chance && session.gold === 0 && session.spin !== null && !session.spin.done,
        (session) => session.rush,
      ),
    // And after it: the wings shut again, with the counts of what made its spins gold kept.
    'chance time over': () =>
      caught(
        (session) => !session.rush && session.gilded >= 1,
        (session) => session.rush,
      ),
    'an ordinary spin on the reels and gold ones held': () =>
      caught((session) => !session.chance && session.spin !== null && session.gold >= 1 && session.gilded + session.lucky > session.gold),
  };
  /** Each of them as it is written down. A moment is the same every time it is caught, so it is caught once. */
  const written = new Map<string, string>();
  const text = (name: string): string => {
    const known = written.get(name) ?? serialize(AT[name]());
    written.set(name, known);
    return known;
  };
  const saved = (name: string): Save => JSON.parse(text(name));
  /** How many gold spins a save still has to play, the one on its screen included. */
  const left = (save: Save): number => (save.session.gold as number) + (save.session.chance === true ? 1 : 0);

  it.each(Object.keys(AT))('comes back as it was, to the byte: %s', { timeout: LONG }, (name) => {
    const session = AT[name]();
    const back = reread(session, 3);
    expect(serialize(back)).toBe(serialize(session));
    // Caught again it is the same moment, to the byte: what the other tests here take for it is this.
    if (!written.has(name)) written.set(name, serialize(session));
    expect(serialize(session)).toBe(text(name));
    expect(JSON.parse(serialize(back)).version).toBe(STORAGE_VERSION);
    expect([back.gold, back.gilded, back.lucky, back.rush, back.chance]).toEqual([session.gold, session.gilded, session.lucky, session.rush, session.chance]);
    expect(chanceLeft(back)).toBe(chanceLeft(session));
    // And it plays on exactly as the machine it was taken from, given the same draws.
    session.machine.rng = seededRng(9);
    back.machine.rng = seededRng(9);
    for (let i = 0; i < 400; i++) for (const machine of [session, back]) advance(machine, DT);
    expect(plain(back)).toEqual(plain(session));
  });

  it('is the state its name says', { timeout: LONG }, () => {
    // Gold from the lamp, with no chance time: no medal has been wasted, and none has turned a spin.
    const lamp = saved('a spin held gold by the lucky lamp');
    expect(lamp.session).toMatchObject({ rush: false, chance: false, gilded: 0, wasted: 0 });
    expect(lamp.session.gold).toBe(lamp.session.lucky);
    expect(lamp.session.lucky as number).toBeGreaterThanOrEqual(1);
    const lampReels = saved('the lamp’s gold spin on the reels');
    expect(lampReels.session).toMatchObject({ rush: false, chance: true, gilded: 0, wasted: 0 });
    expect(left(lampReels)).toBeLessThanOrEqual(lampReels.session.lucky as number);
    const lampSpin = lampReels.screen.spin as { duration: number; result: SpinResult };
    expect(lampSpin.duration).toBe(TIMING.chanceSpin + reachTime(lampSpin.result));
    // Chance time, from the medal that found the hold full: every gold spin has a medal that made it one.
    const begun = saved('chance time just begun');
    expect(begun.session).toMatchObject({ rush: true, stock: MAX_STOCK, gilded: 1, wasted: 1 });
    expect(left(begun)).toBe((begun.session.gilded as number) + (begun.session.lucky as number));
    for (const name of ['chance time just begun', 'every held spin gold', 'a gold spin on the reels', 'a gold spin’s roll on the board, paid', 'a gold spin’s roll on the board, on its way', 'the last gold spin on the reels']) {
      const { session } = saved(name);
      expect(session.rush, name).toBe(true);
      expect(left(saved(name)), name).toBeGreaterThanOrEqual(1);
      expect(session.gilded as number, name).toBeGreaterThanOrEqual(1);
      expect(session.lucky as number, name).toBeLessThanOrEqual((session.hits as number) - (session.wasted as number));
    }
    const paid = saved('a gold spin’s roll on the board, paid');
    const bonus = paid.screen.bonus as Row;
    // What the square holds, twice over.
    expect(bonus.payout).toBe(BOARD[paid.session.square as number] * CHANCE.multiplier);
    expect(paid.session.chance).toBe(true);
    const reels = saved('a gold spin on the reels');
    const spin = reels.screen.spin as { duration: number; result: SpinResult };
    expect(spin.duration).toBe(TIMING.chanceSpin + reachTime(spin.result));
    expect(saved('every held spin gold').session).toMatchObject({ gold: MAX_STOCK, stock: MAX_STOCK });
    // Medals held while the wings were open are among the ones that hold a gold spin from the start.
    expect(saved('a gold spin’s roll on the board, paid').session.lucky as number).toBeGreaterThan(begun.session.lucky as number);
    expect(saved('the last gold spin on the reels').session).toMatchObject({ gold: 0, chance: true });
    // Over: no gold spin is left, and what there has been is still counted.
    const over = saved('chance time over');
    expect(over.session).toMatchObject({ rush: false, gold: 0, chance: false });
    expect(over.session.gilded as number).toBeGreaterThanOrEqual(1);
    expect(over.session.lucky as number).toBeGreaterThanOrEqual(1);
  });

  // One thing changed in a good save, into something neither chance time nor the lamp ever does.
  const impossible: [string, string, (save: Save) => void][] = [
    ['every held spin gold', 'has more gold spins than spins held', (save) => (save.session.stock = MAX_STOCK - 1)],
    ['every held spin gold', 'has more gold spins than the hold has room for', (save) => (save.session.gold = MAX_STOCK + 1)],
    ['every held spin gold', 'has a gold spin that no medal turned and none held through a lit slot', (save) => (save.session.gilded = (save.session.gilded as number) - 1)],
    ['every held spin gold', 'has turned more spins gold than it has wasted medals', (save) => (save.session.gilded = (save.session.wasted as number) + 1)],
    ['a spin held gold by the lucky lamp', 'has a gold spin with neither a full hold nor the lamp to account for it', (save) => (save.session.lucky = 0)],
    ['a spin held gold by the lucky lamp', 'has held more gold spins through a lit slot than it has held medals', (save) => (save.session.lucky = (save.session.hits as number) - (save.session.wasted as number) + 1)],
    ['a spin held gold by the lucky lamp', 'is in chance time though its hold has never been found full', (save) => (save.session.rush = true)],
    ['the lamp’s gold spin on the reels', 'is in chance time though its hold has never been found full', (save) => (save.session.rush = true)],
    ['chance time over', 'is in chance time with no gold spin left to play', (save) => (save.session.rush = true)],
    ['chance time just begun', 'has a number of gold spins that is not a whole one', (save) => (save.session.gold = 0.5)],
    ['chance time just begun', 'has lost its count of gold spins', (save) => delete save.session.gilded],
    ['chance time just begun', 'says in words whether its screen is gold', (save) => (save.session.chance = 'no')],
    ['chance time just begun', 'has lost its count of the lamp’s gold spins', (save) => delete save.session.lucky],
    ['chance time just begun', 'has a count of the lamp’s gold spins that is not a whole one', (save) => (save.session.lucky = 1.5)],
    ['chance time just begun', 'has fewer than no gold spins of the lamp’s', (save) => (save.session.lucky = -1)],
    ['chance time just begun', 'does not say whether it is in chance time', (save) => delete save.session.rush],
    ['chance time just begun', 'says in words whether it is in chance time', (save) => (save.session.rush = 'yes')],
    ['chance time just begun', 'says with a number whether it is in chance time', (save) => (save.session.rush = 1)],
    ['a gold spin on the reels', 'has neither of the lamp’s two numbers, like a save of the version before', (save) => (save.session = withoutLamp(save).session)],
  ];

  it.each(impossible)('%s that %s is no machine', { timeout: LONG }, (name, _what, change) => {
    const save = saved(name);
    const before = JSON.stringify(save);
    expect(restore(before, 1)).not.toBeNull();
    change(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });

  it('takes the counts chance time leaves behind for what they are: none of them says a gold spin is still to come', { timeout: LONG }, () => {
    // After chance time a machine has turned spins gold and held some through open wings, and has none left: it reads, with its wings shut.
    const over = restore(text('chance time over'), 1) as Session;
    expect([over.rush, over.gold, over.chance, chanceLeft(over)]).toEqual([false, 0, false, 0]);
    expect(over.gilded).toBeGreaterThanOrEqual(1);
    // Fewer of either than there were is still a machine, as long as no gold spin is left without a medal for it.
    const fewer = saved('chance time over');
    Object.assign(fewer.session, { gilded: 0, lucky: 0 });
    expect(restore(JSON.stringify(fewer), 1)).toMatchObject({ gilded: 0, lucky: 0, rush: false });
    // And the lamp's gold spin is the lamp's with or without a chance time before it.
    const lamp = saved('a spin held gold by the lucky lamp');
    Object.assign(lamp.session, { gilded: 1, wasted: 1, hits: (lamp.session.hits as number) + 1 });
    expect(restore(JSON.stringify(lamp), 1)).toMatchObject({ gilded: 1, rush: false, gold: lamp.session.gold });
  });

  it('reads a save of the version before the lamp by that game’s rule: in chance time exactly when a gold spin is held or playing', { timeout: LONG }, () => {
    /** One of today's machines as the version before the lamp would have written it, had all its gold spins been turned by a full hold. */
    const before = (name: string): Save => {
      const save = withoutLamp(saved(name));
      save.version = VERSION_BEFORE_LAMP;
      // That game counted every gold spin among the ones a medal had turned, and each of those medals among the wasted.
      const turned = (save.session.gilded as number) + (saved(name).session.lucky as number);
      Object.assign(save.session, { gilded: turned, wasted: Math.max(save.session.wasted as number, turned), hits: (save.session.hits as number) + turned });
      return save;
    };
    for (const name of Object.keys(AT)) {
      const save = before(name);
      for (const key of LAMP_NUMBERS) expect(save.session, name).not.toHaveProperty(key);
      const back = restore(JSON.stringify(save), 1);
      expect(back, name).not.toBeNull();
      // None of its gold spins was gold from the start, and it is in chance time if it has one still to play.
      expect(back?.lucky, name).toBe(0);
      expect(back?.rush, name).toBe(left(save) > 0);
      expect([back?.gold, back?.gilded, back?.chance], name).toEqual([save.session.gold, save.session.gilded, save.session.chance]);
      // Written again it is a save of this version with those two numbers in it, which reads back the same.
      const again = JSON.parse(serialize(back as Session)) as Save;
      expect(again.version, name).toBe(STORAGE_VERSION);
      expect(again.session, name).toEqual(numbersWithLamp(save.session));
      expect(JSON.stringify(again.session), name).toBe(JSON.stringify(numbersWithLamp(save.session)));
      expect([again.machine, again.screen], name).toEqual([save.machine, save.screen]);
      expect(serialize(restore(JSON.stringify(again), 1) as Session), name).toBe(JSON.stringify(again));
      // Given either of the lamp's numbers under its own version, it is no save of that version.
      for (const extra of [{ lucky: 0 }, { rush: left(save) > 0 }, { lucky: 0, rush: left(save) > 0 }]) {
        expect(restore(JSON.stringify({ ...save, session: { ...save.session, ...extra } }), 1), name).toBeNull();
      }
    }
    // Not in chance time: nothing gold held or playing, whatever it has turned gold before.
    expect(restore(JSON.stringify(before('chance time over')), 1)).toMatchObject({ rush: false, lucky: 0 });
    expect(before('chance time over').session.gilded as number).toBeGreaterThanOrEqual(1);
    // In it: with gold spins held, and with the last of them on the reels.
    expect(restore(JSON.stringify(before('every held spin gold')), 1)).toMatchObject({ rush: true, lucky: 0, gold: MAX_STOCK });
    expect(restore(JSON.stringify(before('the last gold spin on the reels')), 1)).toMatchObject({ rush: true, lucky: 0, gold: 0, chance: true });
  });

  it('loses a gold spin whose screen has gone wrong, with its gold, and keeps the machine and the gold spins still held', { timeout: LONG }, () => {
    // A gold spin's reels with an ordinary spin's time: no spin this machine plays. It is left off, and nothing is gold on the screen.
    const reels = saved('a gold spin on the reels');
    (reels.screen.spin as Row).duration = TIMING.quickSpin + reachTime((reels.screen.spin as { result: SpinResult }).result);
    const back = restore(JSON.stringify(reels), 1) as Session;
    expect(back).not.toBeNull();
    expect([back.spin, back.chance]).toEqual([null, false]);
    expect(back.gold).toBe(reels.session.gold);
    expect(back.credits).toBe(reels.session.credits);
    // With gold spins still held it is still chance time, and what the lamp and the full hold have counted is kept.
    expect([back.rush, back.gilded, back.lucky]).toEqual([true, reels.session.gilded, reels.session.lucky]);
    // The last gold spin of chance time, gone the same way, takes chance time with it: none is left to play.
    const last = saved('the last gold spin on the reels');
    expect([last.session.rush, last.session.gold, last.session.chance]).toEqual([true, 0, true]);
    (last.screen.spin as Row).duration = TIMING.quickSpin + reachTime((last.screen.spin as { result: SpinResult }).result);
    const ended = restore(JSON.stringify(last), 1) as Session;
    expect([ended.spin, ended.chance, ended.gold, ended.rush, chanceLeft(ended)]).toEqual([null, false, 0, false, 0]);
    expect([ended.gilded, ended.lucky]).toEqual([last.session.gilded, last.session.lucky]);
    // So does the lamp's gold spin lose its gold with its screen, and that was never chance time.
    const lampReels = saved('the lamp’s gold spin on the reels');
    (lampReels.screen.spin as Row).duration = TIMING.spin + reachTime((lampReels.screen.spin as { result: SpinResult }).result);
    const lampless = restore(JSON.stringify(lampReels), 1) as Session;
    expect([lampless.spin, lampless.chance, lampless.rush, lampless.gold]).toEqual([null, false, false, lampReels.session.gold]);
    // The other way round: an ordinary spin called gold is left off as well.
    const ordinary = saved('an ordinary spin on the reels and gold ones held');
    ordinary.session.chance = true;
    const other = restore(JSON.stringify(ordinary), 1) as Session;
    expect([other.spin, other.chance]).toEqual([null, false]);
    // A gold roll that says it paid the square once is not this machine's roll: it is left off, and is not paid again.
    const paid = saved('a gold spin’s roll on the board, paid');
    (paid.screen.bonus as Row).payout = BOARD[paid.session.square as number];
    const once = restore(JSON.stringify(paid), 1) as Session;
    expect([once.bonus, once.chance, once.paidOut]).toEqual([null, false, paid.session.paidOut]);
    // And a screen called gold with nothing on it is simply not gold, on a machine that has made a spin gold for it.
    const idle = saved('an ordinary spin on the reels and gold ones held');
    idle.screen = { spin: null, bonus: null, roulette: null };
    idle.session.chance = true;
    expect((idle.session.gilded as number) + (idle.session.lucky as number)).toBeGreaterThan(idle.session.gold as number);
    const empty = restore(JSON.stringify(idle), 1) as Session;
    expect([empty.chance, empty.gold]).toEqual([false, idle.session.gold]);
    // On one that has not, it is no machine: every gold spin it has made is still held, and none can be on the screen as well.
    for (const name of ['a spin held gold by the lucky lamp', 'chance time just begun']) {
      const only = saved(name);
      expect(only.session.gold, name).toBe((only.session.gilded as number) + (only.session.lucky as number));
      expect(only.session.chance, name).toBe(false);
      only.session.chance = true;
      expect(restore(JSON.stringify(only), 1), name).toBeNull();
      only.screen = { spin: null, bonus: null, roulette: null };
      expect(restore(JSON.stringify(only), 1), name).toBeNull();
    }
  });

  it('brings the lamp’s gold spin back gold through the game its line leads to, and pays its square twice over once', () => {
    // An empty field, the lamp on the left slot, and one medal over the lip through it: its spin is gold from the start.
    const session = createSession(7, { balls: 0 });
    session.machine.medals = [];
    script(session, [0.03, 0.3, 0.9, 0.2]);
    const { machine } = session;
    machine.medals.push({ id: machine.nextId++, x: CHECKERS.positions[0], y: pusherFront(machine.time) + 0.5, level: 1, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1 });
    const events: SessionEvent[] = [];
    advance(session, DT, events);
    expect(events.filter((event) => event.type === 'checker')).toEqual([{ type: 'checker', gate: 0, held: true, gold: false, lucky: true }]);
    // Its reels are on the screen in that step: three even digits, and then a two on the die.
    expect([session.chance, session.gold, session.lucky, session.gilded, session.rush]).toEqual([true, 0, 1, 0, false]);
    const caughtAt = (when: () => boolean): Session => {
      for (let i = 0; i < 20 * 60 && !when(); i++) advance(session, DT, events);
      expect(when()).toBe(true);
      const back = reread(session, 3);
      expect(serialize(back)).toBe(serialize(session));
      expect([back.chance, back.lucky, back.gilded, back.rush]).toEqual([true, 1, 0, false]);
      return back;
    };
    // On the reels, with the line held up, on its way round the board, and paid.
    expect(caughtAt(() => session.spin !== null && !session.spin.done).spin?.duration).toBe(TIMING.chanceSpin + TIMING.reach);
    expect(caughtAt(() => session.spin?.done === true).spin?.done).toBe(true);
    expect(caughtAt(() => session.bonus?.kind === 'sugoroku' && session.bonus.payout < 0).bonus).toMatchObject({ kind: 'sugoroku', roll: 2, payout: -1 });
    // A copy taken while the piece is on its way pays what the machine it was taken from pays: the square's medals twice over.
    const copy = reread(session, 3);
    const square = squareAfter(0, 2);
    const paid = caughtAt(() => session.bonus?.kind === 'sugoroku' && session.bonus.payout >= 0);
    expect(paid.bonus).toMatchObject({ payout: BOARD[square] * CHANCE.multiplier });
    expect(session.paidOut).toBe(BOARD[square] * CHANCE.multiplier);
    const after: SessionEvent[] = [];
    for (let i = 0; i < 20 * 60 && copy.bonus !== null; i++) advance(copy, DT, after);
    expect(after.filter((event) => event.type === 'sugorokuEnd')).toEqual([{ type: 'sugorokuEnd', square, payout: BOARD[square] * CHANCE.multiplier, fever: false }]);
    expect([copy.paidOut, copy.chance, copy.rush]).toEqual([BOARD[square] * CHANCE.multiplier, false, false]);
    // The one that was read back paid already, and does not pay again.
    for (let i = 0; i < 20 * 60 && paid.bonus !== null; i++) advance(paid, DT, after);
    expect(paid.paidOut).toBe(BOARD[square] * CHANCE.multiplier);
    // The same save called ordinary is not this machine's roll, and neither is its roll paid once.
    const forged = JSON.parse(serialize(session)) as Save;
    forged.session.chance = false;
    expect(restore(JSON.stringify(forged), 1)).toMatchObject({ bonus: null, chance: false });
    const once = JSON.parse(serialize(session)) as Save;
    (once.screen.bonus as Row).payout = BOARD[square];
    expect(restore(JSON.stringify(once), 1)).toMatchObject({ bonus: null, chance: false, paidOut: BOARD[square] * CHANCE.multiplier });
  });

  it('refuses a gold spin on the screen of a machine no medal has made gold, and takes it once one has', () => {
    // A machine with one ordinary spin on its reels, as today's game writes it: one medal went through a slot the lamp was not on.
    const session = createSession(7, { balls: 0 });
    session.stock = 1;
    session.hits = 1;
    advance(session, DT);
    expect(session.spin).not.toBeNull();
    const forged = (change: (save: Save) => void): Session | null => {
      const save = JSON.parse(serialize(session)) as Save;
      // The spin is given a gold spin's reels, so that nothing about it alone says it is not one.
      const spin = save.screen.spin as { duration: number; result: SpinResult };
      spin.duration = TIMING.chanceSpin + reachTime(spin.result);
      change(save);
      return restore(JSON.stringify(save), 1);
    };
    // Untouched but for its reels it is not a spin this machine plays, and is left off: the machine is kept.
    expect(forged(() => {})).toMatchObject({ spin: null, chance: false, gold: 0, gilded: 0, lucky: 0, rush: false });
    // Called gold with no medal ever wasted on a full hold and none held through a lit slot, it would be paid double for nothing: no machine.
    expect(forged((save) => (save.session.chance = true))).toBeNull();
    // Nor with a medal wasted that did not gild, or a spin gilded that no medal was wasted for.
    expect(forged((save) => Object.assign(save.session, { chance: true, wasted: 1, hits: 2 }))).toBeNull();
    expect(forged((save) => Object.assign(save.session, { chance: true, gilded: 1, hits: 2 }))).toBeNull();
    // With one medal that found the hold full and gilded a spin, it is that spin, in the chance time that medal began, and comes back gold.
    const gilded = forged((save) => Object.assign(save.session, { chance: true, gilded: 1, wasted: 1, hits: 2, rush: true }));
    expect(gilded).toMatchObject({ chance: true, gold: 0, gilded: 1, lucky: 0, rush: true });
    expect(gilded?.spin).not.toBeNull();
    expect(chanceLeft(gilded as Session)).toBe(1);
    // One gilded spin cannot be on the reels and held as well; two can be one of each.
    expect(forged((save) => Object.assign(save.session, { chance: true, gilded: 1, wasted: 1, hits: 3, stock: 1, gold: 1, rush: true }))).toBeNull();
    expect(forged((save) => Object.assign(save.session, { chance: true, gilded: 2, wasted: 2, hits: 4, stock: 1, gold: 1, rush: true }))).toMatchObject({ chance: true, gold: 1, gilded: 2, rush: true });
    // With the one medal it has held counted as held through the lit slot, it is that medal's spin, gold from the start, and no chance time.
    const lamp = forged((save) => Object.assign(save.session, { chance: true, lucky: 1 }));
    expect(lamp).toMatchObject({ chance: true, gold: 0, gilded: 0, lucky: 1, rush: false });
    expect(lamp?.spin).not.toBeNull();
    expect(chanceLeft(lamp as Session)).toBe(1);
    // Not with more medals held through a lit slot than it has held at all, and not on a medal that was wasted.
    expect(forged((save) => Object.assign(save.session, { chance: true, lucky: 2 }))).toBeNull();
    expect(forged((save) => Object.assign(save.session, { chance: true, lucky: 1, wasted: 1 }))).toBeNull();
    // One of the lamp's cannot be on the reels and held as well; two can be one of each, and one of the lamp's with one a full hold turned.
    expect(forged((save) => Object.assign(save.session, { chance: true, lucky: 1, hits: 2, stock: 1, gold: 1 }))).toBeNull();
    expect(forged((save) => Object.assign(save.session, { chance: true, lucky: 2, hits: 2, stock: 1, gold: 1 }))).toMatchObject({ chance: true, gold: 1, lucky: 2, rush: false });
    expect(forged((save) => Object.assign(save.session, { chance: true, lucky: 1, gilded: 1, wasted: 1, hits: 3, stock: 1, gold: 1, rush: true }))).toMatchObject({ chance: true, gold: 1, lucky: 1, gilded: 1, rush: true });
    // And it is not chance time on a machine whose hold has never been found full, whatever the lamp has made gold.
    expect(forged((save) => Object.assign(save.session, { chance: true, lucky: 1, rush: true }))).toBeNull();
    expect(forged((save) => Object.assign(save.session, { rush: true }))).toBeNull();
    expect(forged((save) => Object.assign(save.session, { rush: true, gilded: 1, wasted: 1, hits: 2 }))).toBeNull();
    // And a save that says its screen is gold, with nothing on the screen and nothing ever gilded, is refused too.
    expect(
      forged((save) => {
        save.session.chance = true;
        save.screen = { spin: null, bonus: null, roulette: null };
      }),
    ).toBeNull();
  });
});

// ── Jewels ──────────────────────────────────────────────────────────────────

describe('the jewels in a save', () => {
  /** A machine with its two jewels on the lower table and one in the air, three lamps lit and two bonuses paid. */
  const withJewelsAbout = (): Session => {
    const session = createSession(9);
    dropJewel(session.machine);
    session.jewels = 3;
    session.jewelBonuses = 2;
    return session;
  };

  it('are medals that say so, on the tables and in the air, with the lamps and the bonuses among the numbers', () => {
    const session = withJewelsAbout();
    const text = serialize(session);
    const save = JSON.parse(text) as Save;
    expect(save.version).toBe(STORAGE_VERSION);
    expect(save.machine.medals.filter((medal) => medal.jewel === true)).toHaveLength(START_JEWELS);
    expect(save.machine.falling.map((medal) => medal.jewel)).toEqual([true]);
    // Nothing else says whether it is a jewel: a medal is written as it was before there were any.
    expect(text.split('"jewel":true')).toHaveLength(START_JEWELS + 2);
    expect(text).not.toContain('"jewel":false');
    expect([save.session.jewels, save.session.jewelBonuses]).toEqual([3, 2]);
    const back = reread(session);
    expect(plain(back)).toEqual(plain(session));
    expect(serialize(back)).toBe(text);
    expect(jewelsOnField(back.machine)).toBe(START_JEWELS + 1);
  });

  it('play on as they would have: the one in the air lands as a jewel, and the next over the front lights the fourth lamp', () => {
    const session = withJewelsAbout();
    const back = reread(session);
    for (const one of [session, back]) {
      script(one, []);
      for (let i = 0; i < Math.round((JEWEL_DROP.time + 0.1) / DT); i++) advance(one, DT);
      expect(one.machine.falling).toEqual([]);
      expect(one.machine.medals.filter((medal) => medal.jewel)).toHaveLength(START_JEWELS + 1);
    }
    expect(plain(back)).toEqual(plain(session));
    const lower = back.machine.medals.find((medal) => medal.jewel && medal.level === 0);
    if (!lower) throw new Error('no jewel on the lower table');
    lower.y = FIELD.depth + 0.1;
    const events: SessionEvent[] = [];
    advance(back, DT, events);
    expect(events.filter((event) => event.type === 'jewel')).toEqual([{ type: 'jewel', lamps: 4, payout: JEWEL.prize }]);
    expect([back.jewels, back.jewelBonuses]).toEqual([4, 2]);
    // And that is a save too.
    expect(serialize(reread(back))).toBe(serialize(back));
  });
});

describe('a save written before the machine had jewels, chance time or the three bowls', () => {
  // Written by the game as it was before any of the three, with its own `serialize`: see the fixture's `about`.
  const OLD = beforeJewels.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = beforeJewels;
  const total = (events: SessionEvent[], type: 'landed' | 'won' | 'lost'): number =>
    events.reduce((sum, event) => sum + (event.type === type ? event.count : 0), 0);

  it('is a save of version 3: today’s field with no jewel on it and no payout works in it, and today’s numbers but for chance time’s and the lamps', () => {
    const save = old();
    expect(save.version).toBe(VERSION_BEFORE_CHANCE);
    expect(save.version).not.toBe(STORAGE_VERSION);
    const today = JSON.parse(serialize(createSession(1))) as Save;
    for (const key of ['hopper', 'lifts']) expect(save.machine).not.toHaveProperty(key);
    expect(Object.keys(withWorks(save.machine))).toEqual(Object.keys(today.machine));
    expect(Object.keys(numbersToday(save.session))).toEqual(Object.keys(today.session));
    for (const key of ['jewels', 'jewelBonuses', 'gold', 'gilded', 'chance']) expect(save.session).not.toHaveProperty(key);
    expect([...save.machine.medals, ...save.machine.falling].some((medal) => 'jewel' in medal)).toBe(false);
    // It was caught in the middle of play: medals on a rail and in the air, a ball on the field, a spin on the screen and more held.
    expect(save.machine.rolling.length).toBeGreaterThanOrEqual(1);
    expect(save.machine.falling.some((medal) => medal.source === 'player')).toBe(true);
    expect(save.machine.medals.filter((medal) => medal.ball)).toHaveLength(1);
    expect(save.screen.spin).toMatchObject({ done: false });
    expect(save.session.stock).toBeGreaterThanOrEqual(2);
    expect(save.session.inserted).toBeGreaterThan(1000);
    expect(save.machine.medals.length).toBeGreaterThan(300);
  });

  it('reads back as the same machine to the last digit, with no jewel on it, no lamp lit and no spin gold', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    // With the payout works at rest: no tower was going up, so no lift is at work.
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(withWorks(save.machine)));
    expect([back.machine.hopper, back.machine.lifts]).toEqual([shutHopper(), []]);
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersToday(save.session)));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
    // The two jewels a new machine has are not laid on a machine that was already in play.
    expect(jewelsOnField(back.machine)).toBe(0);
    expect([back.jewels, back.jewelBonuses]).toEqual([0, 0]);
    expect([back.gold, back.gilded, back.chance]).toEqual([0, 0, false]);
    expect(ballsOnField(back.machine)).toBe(1);
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    expect(text).toBe(JSON.stringify({ ...old(), version: STORAGE_VERSION, machine: withWorks(old().machine), session: numbersToday(old().session) }));
    expect(text).toBe(writtenToday(OLD));
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('plays on as the game that wrote it did, until its first treasure line or its first full hold, but for the spin the lucky lamp makes gold', () => {
    const back = restore(OLD, then.seed) as Session;
    const events: SessionEvent[] = [];
    for (let i = 0; i < then.steps; i++) advance(back, DT, events);
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    expect(total(events, 'landed')).toBe(then.landed);
    expect(total(events, 'won')).toBe(then.won);
    expect(total(events, 'lost')).toBe(then.lost);
    expect(events.flatMap((event) => (event.type === 'checker' ? [event.gate] : []))).toEqual(then.gates);
    // No treasure line ended in those seconds, so no jewel came out; and no medal found the hold full, so no spin turned
    // gold. The machine with jewels and chance time did what the one without did.
    expect(events.flatMap((event) => (event.type === 'spinEnd' ? [event.result.tier] : []))).toEqual(then.lines);
    expect(then.lines).not.toContain('big');
    expect(events.some((event) => event.type === 'jewelDrop')).toBe(false);
    expect(then.wasted).toBe(old().session.wasted);
    // One thing that game did not have has its say. The one medal through a slot in those seconds went through the
    // lit one, so the spin it holds is gold, and a gold spin's reels are quick: one more of the held spins has started
    // than had then. It lost, like the others, so it paid nothing twice over, and nothing else differs.
    expect(events.flatMap((event) => (event.type === 'checker' ? [event.lucky] : []))).toEqual([true]);
    expect([back.lucky, back.gold, back.gilded, back.chance, back.rush]).toEqual([1, 0, 0, false, false]);
    expect([back.stock, back.spins]).toEqual([then.stock - 1, then.spins + 1]);
    expect([back.credits, back.hits, back.wasted, back.paidOut]).toEqual([then.credits, then.hits, then.wasted, then.paidOut]);
    expect(back.tiers).toEqual(then.tiers);
    expect(back.machine.medals).toHaveLength(then.medals);
    expect(ballsOnField(back.machine)).toBe(then.balls);
    expect([back.machine.rolling.length, back.machine.falling.length]).toEqual([then.rolling, then.falling]);
    // And each medal lies where that game's machine left it.
    expect(then.resting).toHaveLength(40);
    for (const rest of then.resting) {
      const medal = back.machine.medals.find((m) => m.id === rest.id);
      expect(medal).toMatchObject({ level: rest.level, tier: rest.tier });
      expect(medal?.x).toBeCloseTo(rest.x, 6);
      expect(medal?.y).toBeCloseTo(rest.y, 6);
    }
  });

  it('lets a jewel go with its next treasure line, like any machine', () => {
    const back = restore(OLD, 1) as Session;
    // The spin on its screen is put aside, and the next one held is made three odd digits, with the chests in order.
    script(back, [0.01, 0.3, 0.9, 0.99, 0.99, 0.5]);
    back.spin = null;
    const events: SessionEvent[] = [];
    const steps = Math.round((TIMING.spin + TIMING.reach + TIMING.celebrate + 0.5) / DT);
    for (let i = 0; i < steps && !events.some((event) => event.type === 'jewelDrop'); i++) advance(back, DT, events);
    expect(events.some((event) => event.type === 'jewelDrop')).toBe(true);
    expect(jewelsOnField(back.machine)).toBe(1);
    expect(serialize(reread(back))).toBe(serialize(back));
  });

  const refused: [string, (save: Save) => void][] = [
    ['called a save of this version', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of the version before jewels', (save) => (save.version = VERSION_BEFORE_JEWELS)],
    ['called a save of the version with chance time and one bowl', (save) => (save.version = VERSION_WITH_ONE_BOWL)],
    ['called a save of the version with one aim', (save) => (save.version = VERSION_WITH_ONE_AIM)],
    ['called a save of the version before the arms', (save) => (save.version = VERSION_BEFORE_ARMS)],
    ['with a jewel on its field, which that game never had', (save) => (save.machine.medals[0].jewel = true)],
    ['with a jewel in the air', (save) => Object.assign(save.machine.falling[0], { source: 'payout', level: 0, rank: 0, jewel: true })],
    ['with a count of lamps among its numbers', (save) => (save.session.jewels = 0)],
    ['with today’s numbers', (save) => (save.session = numbersToday(save.session) as Save['session'])],
    ['with a number missing', (save) => delete save.session.refills],
  ];

  it.each(refused)('is refused %s', (_name, damage) => {
    const save = old();
    damage(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });
});

describe('a save written the day before the machine had jewels', () => {
  // Written by the game as it was that day, chance time and the three bowls in it, with that day's own `serialize`:
  // see the fixture's `about`.
  const OLD = threeBowlsBeforeJewels.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = threeBowlsBeforeJewels;
  const total = (events: SessionEvent[], type: 'landed' | 'won' | 'lost'): number =>
    events.reduce((sum, event) => sum + (event.type === type ? event.count : 0), 0);

  it('is a save of version 5: the ball in the middle bowl of three, every held spin gold, and no word of jewels', () => {
    const save = old();
    expect(save.version).toBe(VERSION_BEFORE_JEWELS);
    expect(save.version).not.toBe(STORAGE_VERSION);
    const today = JSON.parse(serialize(createSession(1))) as Save;
    // Its field is today's but for the payout works, which came two versions after it.
    for (const key of ['hopper', 'lifts']) expect(save.machine).not.toHaveProperty(key);
    expect(Object.keys(withWorks(save.machine))).toEqual(Object.keys(today.machine));
    expect(Object.keys(numbersWithLamp(save.session))).toEqual(Object.keys(today.session));
    for (const key of ['jewels', 'jewelBonuses', ...LAMP_NUMBERS]) expect(save.session).not.toHaveProperty(key);
    expect([...save.machine.medals, ...save.machine.falling].some((medal) => 'jewel' in medal)).toBe(false);
    // A full run, and the ball rolling in the middle bowl on the way that ends in the jackpot, nothing paid for it yet.
    const run = save.screen.roulette as Row;
    expect(run).toMatchObject({ landed: true, level: CHAIN_GOAL, gain: 0, over: false, jackpot: false });
    expect(run.bowl).toMatchObject({ holes: [...FALLS[TO_JACKPOT]], stage: 1, duration: BOWL_TIMES[1], payout: -1 });
    expect((run.bowl as Row).elapsed).toBeGreaterThan(1.5);
    expect((run.bowl as Row).elapsed).toBeLessThan(BOWL_TIMES[1]);
    // The hold is full and every spin in it is gold. None of them is on the screen, which is the ball's.
    expect(save.session).toMatchObject({ stock: MAX_STOCK, gold: MAX_STOCK, chance: false });
    expect(save.session.gilded).toBeGreaterThanOrEqual(MAX_STOCK);
    expect([save.screen.spin, save.screen.bonus]).toEqual([null, null]);
    // It was caught in the middle of play: medals on both rails and in the air, and the jackpot grown past where one starts.
    expect(new Set(save.machine.rolling.map((medal) => medal.arm)).size).toBe(2);
    expect(save.machine.falling.some((medal) => medal.source === 'player')).toBe(true);
    expect(save.machine.medals.length).toBeGreaterThan(300);
    expect(save.session.jackpot).toBeGreaterThan(JACKPOT_START);
  });

  it('reads back as the same machine to the last digit, with no jewel on it and no lamp lit', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    // With the payout works at rest: no tower was going up, so no lift is at work.
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(withWorks(save.machine)));
    expect([back.machine.hopper, back.machine.lifts]).toEqual([shutHopper(), []]);
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersWithLamp(save.session)));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
    // The two jewels a new machine has are not laid on a machine that was already in play.
    expect(jewelsOnField(back.machine)).toBe(0);
    expect([back.jewels, back.jewelBonuses]).toEqual([0, 0]);
    // Its gold spins are still held, and still gold: none of them the lucky lamp's, and chance time on, as it was then.
    expect(chanceLeft(back)).toBe(MAX_STOCK);
    expect([back.lucky, back.rush]).toEqual([0, true]);
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    expect(text).toBe(JSON.stringify({ ...old(), version: STORAGE_VERSION, machine: withWorks(old().machine), session: numbersWithLamp(old().session) }));
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('plays on exactly as the game that wrote it did: the ball down to the jackpot, paid once and to the medal', () => {
    /** That game's seconds of it, with nobody feeding: what was said, when the ball dropped and when the challenge ended. */
    const playOn = () => {
      const back = restore(OLD, then.seed) as Session;
      const events: SessionEvent[] = [];
      const drops: { step: number; bowl: number }[] = [];
      let ended = -1;
      for (let step = 1; step <= then.steps; step++) {
        const now: SessionEvent[] = [];
        advance(back, DT, now);
        for (const event of now) {
          if (event.type === 'bowlDrop') drops.push({ step, bowl: event.bowl });
          if (event.type === 'bowlEnd') ended = step;
        }
        events.push(...now);
      }
      return { back, events, drops, ended };
    };
    // It was in chance time, and its pockets were wider than today's are with their wings open: for this the wings
    // are set as wide as its pockets were.
    const { back, events, drops, ended } = withWings(POCKET_THEN, playOn);
    // Through the middle bowl's hole and into the jackpot's in the very steps that game's ball did, for the same medals.
    expect(drops).toEqual(then.drops);
    expect(ended).toBe(then.steps);
    expect(events.filter((event) => event.type === 'bowlEnd')).toEqual([then.end]);
    expect(then.end).toMatchObject({ jackpot: true, payout: old().session.jackpot, poured: pouredOf(old().session.jackpot as number) });
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    expect(total(events, 'landed')).toBe(then.landed);
    expect(total(events, 'won')).toBe(then.won);
    expect(total(events, 'lost')).toBe(then.lost);
    expect(events.flatMap((event) => (event.type === 'checker' ? [{ pocket: event.gate, held: event.held, gold: event.gold }] : []))).toEqual(then.pockets);
    // The screen was the ball's all that time: no spin ended, so no treasure line let a jewel go, and the machine
    // with jewels did what the one without did.
    expect(events.flatMap((event) => (event.type === 'spinEnd' ? [event.result.tier] : []))).toEqual(then.lines);
    expect(then.lines).toEqual([]);
    expect(events.some((event) => event.type === 'jewelDrop' || event.type === 'jewel' || event.type === 'jewelBonus')).toBe(false);
    expect([back.credits, back.paidOut, back.jackpots, back.jackpot, back.hits, back.wasted]).toEqual([then.credits, then.paidOut, then.jackpots, then.jackpot, then.hits, then.wasted]);
    expect([back.stock, back.gold, back.gilded, back.chance]).toEqual([then.stock, then.gold, then.gilded, then.chance]);
    expect([back.jewels, back.jewelBonuses]).toEqual([0, 0]);
    expect(back.machine.medals).toHaveLength(then.medals);
    expect(medalsOnField(back.machine)).toBe(then.onField);
    expect(ballsOnField(back.machine)).toBe(then.balls);
    expect(back.machine.payoutQueue).toBe(then.payoutQueue);
    // And each medal lies where that game's machine left it.
    expect(then.resting).toHaveLength(40);
    for (const rest of then.resting) {
      const medal = back.machine.medals.find((m) => m.id === rest.id);
      expect(medal).toMatchObject({ level: rest.level, tier: rest.tier });
      expect(medal?.x).toBeCloseTo(rest.x, 6);
      expect(medal?.y).toBeCloseTo(rest.y, 6);
    }

    // With today's wings it is the same machine in every way but one. What a slot counts moves no medal, and the
    // screen was the ball's, so no medal through a slot could start a spin: the field, the ball and the prize are
    // what they were. But only the medals that came over inside today's wings were counted, and those that were
    // not are missing from the medals wasted on its full hold.
    const today = playOn();
    const counted = today.events.flatMap((event) => (event.type === 'checker' ? [event] : []));
    expect(
      someOf(
        counted.map((event) => event.gate),
        then.pockets.map(({ pocket }) => pocket),
      ),
    ).toBe(true);
    expect(counted.every((event) => !event.held && !event.lucky)).toBe(true);
    const missed = then.pockets.length - counted.length;
    expect([today.back.hits, today.back.wasted]).toEqual([then.hits - missed, then.wasted - missed]);
    expect([today.drops, today.ended]).toEqual([then.drops, then.steps]);
    expect(today.events.filter((event) => event.type === 'bowlEnd')).toEqual([then.end]);
    expect([today.back.credits, today.back.paidOut, today.back.jackpots, today.back.jackpot]).toEqual([then.credits, then.paidOut, then.jackpots, then.jackpot]);
    expect(today.back.machine.medals.map(({ id, x, y, level, tier }) => ({ id, x, y, level, tier }))).toEqual(back.machine.medals.map(({ id, x, y, level, tier }) => ({ id, x, y, level, tier })));
  });

  it('lets one jewel go with its next treasure line, which is a gold spin’s', () => {
    const back = restore(OLD, 1) as Session;
    // The ball is put aside, and every draw is made the one that stops the reels on three odd digits: the next spin, a gold one, is a treasure line.
    back.roulette = null;
    script(back, [], 0.01);
    const events: SessionEvent[] = [];
    for (let i = 0; i < 20 * 60 && !events.some((event) => event.type === 'jewelDrop'); i++) advance(back, DT, events);
    expect(events.flatMap((event) => (event.type === 'spinEnd' ? [event.result.tier] : []))).toEqual(['big']);
    expect(back.chance).toBe(true);
    expect(events.filter((event) => event.type === 'jewelDrop')).toHaveLength(1);
    expect(jewelsOnField(back.machine)).toBe(1);
    expect(serialize(reread(back))).toBe(serialize(back));
  });

  it('called a save of the version with one bowl, loses its roulette and gets the ball back: its numbers are that version’s and its ball is not', () => {
    const save = old();
    save.version = VERSION_WITH_ONE_BOWL;
    const back = restore(JSON.stringify(save), 1);
    expect(back).not.toBeNull();
    expect(back?.roulette).toBeNull();
    expect(plain(back as Session)).toEqual(leftOff(save));
    expect(back?.balls).toBe((old().session.balls as number) + 1);
    expect(chanceLeft(back as Session)).toBe(MAX_STOCK);
  });

  const refused: [string, (save: Save) => void][] = [
    ['called a save of this version', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of the version before chance time', (save) => (save.version = VERSION_BEFORE_CHANCE)],
    ['called a save of the version with one aim', (save) => (save.version = VERSION_WITH_ONE_AIM)],
    ['called a save of the version before the arms', (save) => (save.version = VERSION_BEFORE_ARMS)],
    ['with a jewel on its field, which that game never had', (save) => (save.machine.medals[0].jewel = true)],
    ['with a jewel in the air', (save) => Object.assign(save.machine.falling[0], { source: 'payout', level: 0, rank: 0, jewel: true })],
    ['with a count of lamps among its numbers', (save) => (save.session.jewels = 0)],
    ['with the jewel lamps among its numbers, as the version after it had them', (save) => (save.session = withJewels(save.session) as Save['session'])],
    ['with today’s numbers', (save) => (save.session = numbersWithLamp(save.session) as Save['session'])],
    ['with a number missing', (save) => delete save.session.refills],
    ['with more gold spins than it holds', (save) => (save.session.stock = MAX_STOCK - 1)],
  ];

  it.each(refused)('is refused %s', (_name, damage) => {
    const save = old();
    damage(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });
});

// ── The payout works ────────────────────────────────────────────────────────

describe('a save written before the payout works, the three bowls and the jewels', () => {
  // Written by the game as it was when the payout works were begun, which was before the three bowls and the jewels
  // were in it, with its own `serialize`: see the fixture's `about`. The game the day before the payout works is in
  // the describe after this one.
  const OLD = beforeWorks.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = beforeWorks;
  const total = (events: SessionEvent[], type: 'won' | 'lost'): number => events.reduce((sum, event) => sum + (event.type === type ? event.count : 0), 0);

  it('is a save of version 4: towers going up, a prize waiting to be thrown on, and no word of doors or lifts', () => {
    const save = old();
    expect(save.version).toBe(VERSION_WITH_ONE_BOWL);
    expect(save.version).not.toBe(STORAGE_VERSION);
    for (const key of ['hopper', 'lifts']) expect(save.machine).not.toHaveProperty(key);
    expect(save.machine.medals.filter((medal) => (medal.grow as number) > 0)).toHaveLength(2);
    expect(save.machine.growing).toBeGreaterThan(20);
    // More than enough waiting for today's machine to pour, and some of it already in the air, thrown from the slot.
    expect(save.machine.payoutQueue).toBeGreaterThanOrEqual(POUR.threshold);
    expect(save.machine.falling.filter((medal) => medal.source === 'payout').length).toBeGreaterThan(0);
    expect(save.machine.falling.every((medal) => medal.source !== 'pour')).toBe(true);
    // Its numbers are today's numbers but for the jewel lamps and the lucky lamp's two: chance time was in that game, and jewels and the lamp were not.
    expect(Object.keys(numbersWithLamp(save.session)).sort()).toEqual(Object.keys(JSON.parse(serialize(createSession(1))).session).sort());
    expect(Object.keys(withWorks(save.machine)).sort()).toEqual(Object.keys(JSON.parse(serialize(createSession(1))).machine).sort());
    // The run on its screen has its last number and the ball is not in a bowl yet, so the screen is one every version can show.
    expect(save.screen.roulette).toMatchObject({ level: CHAIN_GOAL, landed: true, bowl: null });
  });

  it('reads back as the same machine, the doors shut and a lift at work under each tower that was going up', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    expect(back.machine.hopper).toEqual(shutHopper());
    const front = pusherFront(back.machine.time);
    const growing = back.machine.medals.filter((medal) => medal.grow > 0);
    expect(back.machine.lifts).toEqual(growing.map((medal) => ({ id: medal.id, x: medal.x, behind: front - medal.y, size: medal.stack + medal.grow, wait: 0, sunk: -1 })));
    expect(back.machine.lifts).toHaveLength(2);
    expect(back.machine.lifts.every(holds)).toBe(true);
    // Everything else is what was written, to the last digit: the field, the numbers and the screen. No jewel is laid
    // on a machine that was already in play, and no lamp is lit.
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(withWorks(save.machine)));
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersWithLamp(save.session)));
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
    expect(medalsOnField(back.machine)).toBe(then.onField);
    expect(jewelsOnField(back.machine)).toBe(0);
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    const save = old();
    expect(text).toBe(JSON.stringify({ ...save, version: STORAGE_VERSION, machine: withWorks(save.machine), session: numbersWithLamp(save.session) }));
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('plays on by today’s machine: the prize that was waiting is poured, the towers are held until they are built, and not a medal is lost or made', () => {
    const back = restore(OLD, then.seed) as Session;
    const paid = back.paidOut;
    const events: SessionEvent[] = [];
    let emptied = -1;
    for (let i = 0; i < then.steps; i++) {
      advance(back, DT, events);
      if (emptied < 0 && back.machine.payoutQueue === 0) emptied = (i + 1) * DT;
      for (const lift of back.machine.lifts.filter(holds)) {
        const tower = back.machine.medals.find((medal) => medal.id === lift.id);
        expect(tower?.x).toBeCloseTo(lift.x, 6);
        expect(tower?.y).toBeCloseTo(pusherFront(back.machine.time) - lift.behind, 6);
      }
    }
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    // The doors open at once for what was waiting, and it is out in a second and a bit; that game took five to throw it.
    const waiting = old().machine.payoutQueue as number;
    expect(events.find((event) => event.type === 'pourStart')).toEqual({ type: 'pourStart', medals: waiting });
    expect(events.find((event) => event.type === 'pourEnd')).toEqual({ type: 'pourEnd', medals: waiting });
    expect(emptied).toBeLessThan(POUR.opens + waiting / POUR.perSecond + 0.1);
    expect(emptied).toBeLessThan(waiting / 9 / 2);
    // Both towers are finished first, together, and stand free. The ball then goes into the top bowl of today's
    // three, where that game had one bowl, and what its hole pays goes up as more towers after them.
    expect(events.filter((event) => event.type === 'towersReady')[0]).toEqual({ type: 'towersReady', towers: 2 });
    const hole = events.find((event) => event.type === 'bowlEnd');
    expect(hole).toMatchObject({ bowl: 0, payout: 50, poured: pouredOf(50), jackpot: false });
    // Fifteen loose medals are too few to open the doors for: they come out of the slot, and the doors have opened once.
    expect(events.filter((event) => event.type === 'pourStart')).toHaveLength(1);
    expect(back.machine.hopper).toEqual({ phase: 'shut', clock: 0, pours: 1, poured: waiting });
    expect(back.machine.growing).toBe(then.growing);
    expect(back.machine.lifts).toEqual([]);
    // Every medal is accounted for, as it was in that game: what lies on the field and what has left it are what was there and what has been paid since.
    expect(then.onFieldAfter + then.won + then.lost).toBe(then.onField + then.paidOut - paid);
    expect(medalsOnField(back.machine) + total(events, 'won') + total(events, 'lost')).toBe(then.onField + back.paidOut - paid);
    expect(everyPosition(back).every(Number.isFinite)).toBe(true);
    expect(plain(reread(back))).toEqual(plain(back));
  });

  // That version's field is held to that version's shape.
  const spoilt: [string, (save: Save) => void][] = [
    ['called a save of this version', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of the version before the payout works, which had jewel lamps among its numbers', (save) => (save.version = VERSION_BEFORE_WORKS)],
    ['given doors, which that game did not have', (save) => (save.machine.hopper = shutHopper())],
    ['given lifts, which that game did not have', (save) => (save.machine.lifts = [])],
    ['given both, under its old version', (save) => Object.assign(save.machine, { hopper: shutHopper(), lifts: [] })],
    ['holding a medal the hopper poured, which that game had no hopper to pour', (save) => (save.machine.falling[0].source = 'pour')],
    ['left without its count of the medals still to be stacked', (save) => delete save.machine.growing],
  ];

  it.each(spoilt)('is refused when it is %s', (_name, spoil) => {
    const save = old();
    spoil(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });
});

describe('a save written the day before the payout works', () => {
  // Written by main's own `serialize` the day before the payout works, jewels and the three bowls in it: see the fixture's `about`.
  const OLD = jewelsBeforeWorks.save;
  const old = (): Save => JSON.parse(OLD);
  const { then } = jewelsBeforeWorks;
  const total = (events: SessionEvent[], type: 'landed' | 'won' | 'lost'): number => events.reduce((sum, event) => sum + (event.type === type ? event.count : 0), 0);

  it('is a save of version 6: a jewel on the lower table, the ball in the top bowl, two towers going up, and no word of doors or lifts', () => {
    const save = old();
    expect(save.version).toBe(VERSION_BEFORE_WORKS);
    expect(save.version).toBe(6);
    expect(save.version).not.toBe(STORAGE_VERSION);
    for (const key of ['hopper', 'lifts']) expect(save.machine).not.toHaveProperty(key);
    const today = JSON.parse(serialize(createSession(1))) as Save;
    // Its field is today's but for the payout works, and its numbers are today's but for the lucky lamp's two: the jewel lamps were in that game.
    expect(Object.keys(withWorks(save.machine))).toEqual(Object.keys(today.machine));
    expect(Object.keys(save.session)).toEqual(Object.keys(today.session).filter((key) => !LAMP_NUMBERS.includes(key)));
    expect(Object.keys(numbersWithLamp(save.session))).toEqual(Object.keys(today.session));
    // One of the two jewels a machine starts with is still lying on the lower table, and the other has lit a lamp.
    const jewels = save.machine.medals.filter((medal) => medal.jewel === true);
    expect(jewels).toHaveLength(1);
    expect(jewels[0]).toMatchObject({ level: 0, tier: 0 });
    expect(save.session).toMatchObject({ jewels: 1, jewelBonuses: 0 });
    // A full run, and the ball a tenth of a second into the top bowl of three, on the way that ends in its own hole.
    const run = save.screen.roulette as Row;
    expect(run).toMatchObject({ landed: true, level: CHAIN_GOAL, gain: 0, over: false, jackpot: false });
    expect(ROULETTE[run.pocket as number]).toBe(50);
    expect(run.bowl).toMatchObject({ holes: [...FALLS[TO_TOP]], stage: 0, duration: BOWL_TIMES[0], payout: -1 });
    expect((run.bowl as Row).elapsed).toBeLessThan(0.2);
    // The fifty's two towers are three medals short of built, and that game had pushed them about while they went up:
    // neither stands on one of the places a tower is put.
    const growing = save.machine.medals.filter((medal) => (medal.grow as number) > 0);
    expect(growing.map((medal) => [medal.stack, medal.grow])).toEqual([
      [22, 3],
      [22, 3],
    ]);
    expect(save.machine.growing).toBe(6);
    const places = [15, 29, 43, 57, 71, 85];
    expect(growing.some((medal) => places.every((x) => Math.abs((medal.x as number) - x) > 0.5))).toBe(true);
    // It was caught in the middle of play: medals on the rails and in the air, three towers standing, and spins held.
    expect(save.machine.rolling.length).toBeGreaterThanOrEqual(2);
    expect(save.machine.falling.some((medal) => medal.source === 'player')).toBe(true);
    expect(save.machine.falling.every((medal) => medal.source !== 'pour')).toBe(true);
    expect(save.machine.medals.filter((medal) => (medal.stack as number) > 1 && medal.grow === 0)).toHaveLength(3);
    expect(save.session.stock).toBe(5);
  });

  it('reads back as the same machine, the doors shut and a lift at work under each of the two towers, where that game had pushed them', () => {
    const back = restore(OLD, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    const save = old();
    expect(back.machine.hopper).toEqual(shutHopper());
    const front = pusherFront(back.machine.time);
    const growing = back.machine.medals.filter((medal) => medal.grow > 0);
    expect(growing).toHaveLength(2);
    expect(back.machine.lifts).toEqual(growing.map((medal) => ({ id: medal.id, x: medal.x, behind: front - medal.y, size: 25, wait: 0, sunk: -1 })));
    expect(back.machine.lifts.every(holds)).toBe(true);
    // Everything else is what was written, to the last digit: the field with its jewel, the numbers with their lamp, and the ball in its bowl.
    const { rng: _rng, ...field } = back.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(withWorks(save.machine)));
    const { machine: _machine, spin, bonus, roulette, ...numbers } = back;
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(numbersWithLamp(save.session)));
    expect([back.lucky, back.rush]).toEqual([0, false]);
    expect(JSON.stringify({ spin, bonus, roulette })).toBe(JSON.stringify(save.screen));
    expect(medalsOnField(back.machine)).toBe(then.onField);
    expect(jewelsOnField(back.machine)).toBe(1);
    expect([back.jewels, back.jewelBonuses]).toEqual([1, 0]);
  });

  it('is written back as a save of this version, which reads back the same', () => {
    const back = restore(OLD, 1) as Session;
    const text = serialize(back);
    const save = old();
    expect(text).toBe(JSON.stringify({ ...save, version: STORAGE_VERSION, machine: withWorks(save.machine), session: numbersWithLamp(save.session) }));
    const twice = restore(text, 1);
    expect(twice).not.toBeNull();
    expect(serialize(twice as Session)).toBe(text);
  });

  it('plays on by today’s machine: its towers finish in their guards, its jewel lights the second lamp, and the bowl pays what that game’s bowl paid, in the same step', () => {
    const back = restore(OLD, then.seed) as Session;
    const paid = back.paidOut;
    const events: SessionEvent[] = [];
    const said: { step: number; event: SessionEvent }[] = [];
    let ended = -1;
    for (let step = 1; step <= then.steps; step++) {
      const now: SessionEvent[] = [];
      advance(back, DT, now);
      for (const event of now) {
        if (event.type === 'bowlEnd') ended = step;
        if (event.type === 'jewel' || event.type === 'jewelBonus' || event.type === 'jewelDrop') said.push({ step, event });
      }
      events.push(...now);
      // A tower in its guard is where its lift is, however the medals round it are pushed.
      for (const lift of back.machine.lifts.filter(holds)) {
        const tower = back.machine.medals.find((medal) => medal.id === lift.id);
        expect(tower?.x).toBeCloseTo(lift.x, 6);
        expect(tower?.y).toBeCloseTo(pusherFront(back.machine.time) - lift.behind, 6);
      }
    }
    expect(back.machine.time).toBeCloseTo(then.time, 9);
    // The two towers that were going up are built first, together, in the time their last three medals take.
    const works = events.filter((event) => event.type === 'towersReady' || event.type === 'towersRise' || event.type === 'pourStart' || event.type === 'pourEnd');
    expect(works[0]).toEqual({ type: 'towersReady', towers: 2 });
    expect(events.findIndex((event) => event.type === 'towersReady')).toBeLessThan(events.findIndex((event) => event.type === 'jewel'));
    // The jewel that lay at the front edge goes over in the very step it did in that game, and lights the second lamp.
    expect(said).toEqual(then.jewels);
    expect([back.jewels, back.jewelBonuses]).toEqual([then.lamps, then.jewelBonuses]);
    // So does the ball drop, into the hole that was drawn for it, for the same medals split the same way: fifteen
    // loose and the rest as two towers, which come up on their lifts and stand built before the twelve seconds are out.
    expect(ended).toBe(then.ended);
    expect(events.filter((event) => event.type === 'bowlEnd')).toEqual([then.end]);
    expect(then.end).toMatchObject({ payout: 50, poured: pouredOf(50), jackpot: false });
    expect(works.slice(1)).toEqual([
      { type: 'towersRise', towers: 2, medals: 50 - pouredOf(50) },
      { type: 'towersReady', towers: 1 },
      { type: 'towersReady', towers: 1 },
    ]);
    // Fifteen and a jewel's one are too few to open the doors for: they came out of the slot, and the hopper has never poured.
    expect(back.machine.hopper).toEqual(shutHopper());
    expect([back.machine.payoutQueue, back.machine.growing, back.machine.lifts]).toEqual([then.payoutQueue, then.growing, []]);
    // What the machine has paid is what that game's machine paid, and every medal is accounted for, as it was there.
    expect(back.paidOut).toBe(then.paidOut);
    expect(back.paidOut - paid).toBe(then.paid);
    expect(then.onFieldAfter + then.won + then.lost).toBe(then.onField + then.paid);
    expect(medalsOnField(back.machine) + total(events, 'won') + total(events, 'lost')).toBe(then.onField + then.paid);
    expect(everyPosition(back).every(Number.isFinite)).toBe(true);
    expect(plain(reread(back))).toEqual(plain(back));
  });

  // That version's field is held to that version's shape, and its numbers to that version's numbers.
  const spoilt: [string, (save: Save) => void][] = [
    ['called a save of this version', (save) => (save.version = STORAGE_VERSION)],
    ['called a save of the version before jewels, which had none on its field', (save) => (save.version = VERSION_BEFORE_JEWELS)],
    ['called a save of the version with one bowl', (save) => (save.version = VERSION_WITH_ONE_BOWL)],
    ['called a save of the version before chance time', (save) => (save.version = VERSION_BEFORE_CHANCE)],
    ['given doors, which that game did not have', (save) => (save.machine.hopper = shutHopper())],
    ['given lifts, which that game did not have', (save) => (save.machine.lifts = [])],
    ['holding a medal the hopper poured, which that game had no hopper to pour', (save) => (save.machine.falling[0].source = 'pour')],
    ['left without its count of lamps', (save) => delete save.session.jewels],
    ['holding a tower going up on top of other medals, where no lift could have it', (save) => (find(save.machine.medals, (medal) => (medal.grow as number) > 0).tier = 1)],
  ];

  it.each(spoilt)('is refused when it is %s', (_name, spoil) => {
    const save = old();
    spoil(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });
});

describe('every version before the payout works', () => {
  /**
   * A machine paid a prize to pour and a prize in towers, as each older version would have written it: without the
   * payout works or the lucky lamp's two numbers, and without whatever else that version did not have. Nothing is on its rails and its arms are
   * where a new machine's are, so the fields of the versions that had one aim, or none, say the same thing.
   */
  const written = (version: number): Save => {
    const session = createSession(20261013, { balls: 0, jewels: 0 });
    buildTowers(session.machine, 60);
    queuePayout(session.machine, 40);
    session.paidOut += 100;
    const save = JSON.parse(serialize(session)) as Save;
    const { hopper: _hopper, lifts: _lifts, rolling, waits, aims, tips, nextId, ...tables } = save.machine;
    const beforeLamp = withoutLamp(save).session;
    const { jewels: _jewels, jewelBonuses: _bonuses, ...beforeJewels } = beforeLamp;
    const { gold: _gold, gilded: _gilded, chance: _chance, ...beforeChance } = beforeJewels;
    const machine = version >= VERSION_BEFORE_CHANCE ? { ...tables, rolling, waits, aims, tips, nextId } : version === VERSION_WITH_ONE_AIM ? { ...tables, rolling, cooldown: 0, aim: 50, tips, nextId } : { ...tables, cooldown: 0, nextId };
    const numbers = version >= VERSION_BEFORE_WORKS ? beforeLamp : version >= VERSION_WITH_ONE_BOWL ? beforeJewels : beforeChance;
    return { ...save, version, machine: machine as Save['machine'], session: numbers as Save['session'] };
  };
  const OLDER = [VERSION_BEFORE_WORKS, VERSION_BEFORE_JEWELS, VERSION_WITH_ONE_BOWL, VERSION_BEFORE_CHANCE, VERSION_WITH_ONE_AIM, VERSION_BEFORE_ARMS];

  it('is one of six, and each is a save of its own version and of no other', () => {
    expect(OLDER).toEqual([6, 5, 4, 3, 2, 1]);
    for (const version of OLDER) {
      const save = written(version);
      expect(restore(JSON.stringify(save), 1), `version ${version}`).not.toBeNull();
      // Called today's, it has no doors and no lifts.
      expect(restore(JSON.stringify({ ...save, version: STORAGE_VERSION }), 1), `version ${version} as today's`).toBeNull();
      // Given the payout works under its old number, it is not a save of that version either.
      expect(restore(JSON.stringify({ ...save, machine: { ...save.machine, hopper: shutHopper(), lifts: [] } }), 1), `version ${version} with works`).toBeNull();
    }
  });

  it.each(OLDER)('comes back, from version %i, with the doors shut and a lift at work under each tower that was going up, and plays on', (version) => {
    const back = restore(JSON.stringify(written(version)), 7) as Session;
    expect(back).not.toBeNull();
    // The doors are shut and have never poured. Each of the three towers is found on a lift whose guard is up.
    expect(back.machine.hopper).toEqual(shutHopper());
    const front = pusherFront(back.machine.time);
    const growing = back.machine.medals.filter((medal) => medal.grow > 0);
    expect(growing).toHaveLength(3);
    expect(back.machine.lifts).toEqual(growing.map((medal) => liftAtWork(medal, front)));
    expect(back.machine.lifts.map((lift) => [lift.size, lift.wait, lift.sunk])).toEqual([
      [20, 0, -1],
      [20, 0, -1],
      [20, 0, -1],
    ]);
    // It is written as a save of today's version, which reads back the same.
    const text = serialize(back);
    expect((JSON.parse(text) as Save).version).toBe(STORAGE_VERSION);
    expect(serialize(restore(text, 7) as Session)).toBe(text);
    // Played on, the forty that were waiting are poured at once, and the towers stand built: not a medal lost or made.
    const start = medalsOnField(back.machine);
    const events: SessionEvent[] = [];
    advance(back, DT, events);
    expect(events.filter((event) => event.type === 'pourStart')).toEqual([{ type: 'pourStart', medals: 40 }]);
    expect(events.some((event) => event.type === 'towersRise')).toBe(false);
    for (let i = 0; i < 240 && (back.machine.lifts.length > 0 || back.machine.hopper.phase !== 'shut'); i++) advance(back, DT, events);
    expect(events.filter((event) => event.type === 'pourEnd')).toEqual([{ type: 'pourEnd', medals: 40 }]);
    expect(events.filter((event) => event.type === 'towersReady')).toEqual([{ type: 'towersReady', towers: 3 }]);
    expect(back.machine.hopper).toEqual({ phase: 'shut', clock: 0, pours: 1, poured: 40 });
    const gone = events.reduce((sum, event) => sum + (event.type === 'won' || event.type === 'lost' ? event.count : 0), 0);
    expect(medalsOnField(back.machine) + gone).toBe(start);
  });
});

describe('the payout works in a save', () => {
  /** A machine paid a prize to pour and a prize in towers at once, run until `when` says. */
  const caught = (when: (session: Session) => boolean): Session => {
    const session = createSession(20261012, { balls: 0 });
    queuePayout(session.machine, 70);
    buildTowers(session.machine, 60);
    session.paidOut += 130;
    for (let i = 0; i < 1200 && !when(session); i++) advance(session, DT);
    if (!when(session)) throw new Error('no such moment');
    return session;
  };
  const MOMENTS: [string, (session: Session) => boolean][] = [
    ['the doors dropping open and the guards rising', (s) => s.machine.hopper.phase === 'opening' && s.machine.hopper.clock > 0.2 && s.machine.lifts[0].wait > 0],
    ['the prize pouring and the towers coming up', (s) => s.machine.hopper.phase === 'pouring' && s.machine.hopper.poured > 20 && s.machine.medals.some((medal) => medal.grow > 0 && medal.stack > 4)],
    ['the last medal gone and the doors being drawn shut', (s) => s.machine.hopper.phase === 'closing' && s.machine.hopper.clock > 0.2],
    ['the towers built and their guards sinking', (s) => s.machine.lifts.length > 0 && s.machine.lifts.every((lift) => lift.sunk > 0.1)],
    ['everything at rest again, the hopper still saying what it poured', (s) => s.machine.hopper.phase === 'shut' && s.machine.lifts.length === 0 && s.machine.hopper.poured === 70],
  ];

  it.each(MOMENTS)('keeps %s, and plays on from there as the session does', (_name, when) => {
    const session = caught(when);
    const text = serialize(session);
    const back = restore(text, 1);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(serialize(back)).toBe(text);
    expect(back.machine.hopper).toEqual(session.machine.hopper);
    expect(back.machine.lifts).toEqual(session.machine.lifts);
    session.machine.rng = seededRng(99);
    back.machine.rng = seededRng(99);
    for (let i = 0; i < 240; i++) {
      advance(session, DT);
      advance(back, DT);
    }
    expect(serialize(back)).toBe(serialize(session));
  });

  /** A save caught at one of those moments, typed loosely enough to spoil. */
  const at = (index: number): Save => JSON.parse(serialize(caught(MOMENTS[index][1])));
  const liftsIn = (save: Save): Row[] => save.machine.lifts as Row[];
  const doors = (save: Save): Row => save.machine.hopper as Row;
  const towerOn = (save: Save, lift: Row): Row => find(save.machine.medals, (medal) => medal.id === lift.id);

  const forged: [string, number, (save: Save) => void][] = [
    ['doors pouring with nothing left to pour', 1, (save) => (save.machine.payoutQueue = 0)],
    ['doors dropping open for a prize too small to pour', 0, (save) => (save.machine.payoutQueue = POUR.threshold - 1)],
    ['doors that have been dropping open for longer than they take', 0, (save) => (doors(save).clock = POUR.opens + 0.01)],
    ['doors that have been shutting for as long as they take, and are not shut', 2, (save) => (doors(save).clock = POUR.closes)],
    ['shut doors with their clock still running', 4, (save) => (doors(save).clock = 0.1)],
    ['open doors with a clock running', 1, (save) => (doors(save).clock = 0.1)],
    ['doors doing something a hopper does not do', 1, (save) => (doors(save).phase = 'jammed')],
    ['doors that have poured half a medal', 1, (save) => (doors(save).poured = 20.5)],
    ['doors that are pouring and have never begun a pour', 1, (save) => (doors(save).pours = 0)],
    ['shut doors that have poured and have never begun a pour', 4, (save) => (doors(save).pours = 0)],
    ['doors that have begun half a pour', 1, (save) => (doors(save).pours = 1.5)],
    ['doors with no count of their pours', 1, (save) => delete doors(save).pours],
    ['doors still dropping open with some of the prize already gone', 0, (save) => (doors(save).poured = 3)],
    ['doors with a part too many', 1, (save) => (doors(save).swing = 1)],
    ['no doors at all', 1, (save) => delete save.machine.hopper],
    ['no list of lifts', 1, (save) => delete save.machine.lifts],
    ['a tower going up with no lift under it', 1, (save) => liftsIn(save).pop()],
    ['a lift with no tower', 1, (save) => (liftsIn(save)[0].id = (save.machine.nextId as number) - 1)],
    ['two lifts under one tower', 1, (save) => (liftsIn(save)[1].id = liftsIn(save)[0].id)],
    ['a lift whose tower stands somewhere else', 1, (save) => (towerOn(save, liftsIn(save)[0]).x = (liftsIn(save)[0].x as number) + 1)],
    ['a lift whose tower has slipped back from it', 1, (save) => (liftsIn(save)[0].behind = (liftsIn(save)[0].behind as number) + 0.5)],
    ['a lift building a taller tower than the one on it', 1, (save) => (liftsIn(save)[0].size = (liftsIn(save)[0].size as number) + 1)],
    ['a lift under a ball', 1, (save) => Object.assign(towerOn(save, liftsIn(save)[0]), { ball: true })],
    ['a lift under a tower on the lower table', 1, (save) => (towerOn(save, liftsIn(save)[0]).level = 0)],
    // A tower is put on the deck itself. One lying on other medals is carried along by them after its lift has placed it.
    ['a tower in its guard lying on top of other medals', 1, (save) => (towerOn(save, liftsIn(save)[0]).tier = 1)],
    ['a tower in its guard lying on top of other medals, its guard still rising', 0, (save) => (towerOn(save, liftsIn(save)[0]).tier = 1)],
    [
      'a lift whose hatch is in the side wall, its tower with it',
      1,
      (save) => {
        liftsIn(save)[0].x = 1;
        towerOn(save, liftsIn(save)[0]).x = 1;
      },
    ],
    [
      'a tower held inside the back wall, where its hatch has gone',
      1,
      (save) => {
        const [lift] = liftsIn(save);
        lift.behind = pusherFront(save.machine.time as number) - 1;
        towerOn(save, lift).y = 1;
      },
    ],
    [
      'a tower that has begun to come up before its guard is',
      0,
      (save) => {
        const tower = towerOn(save, liftsIn(save)[0]);
        tower.stack = 2;
        tower.grow = (tower.grow as number) - 1;
        save.machine.growing = (save.machine.growing as number) - 1;
      },
    ],
    ['a guard that is up, with its tower built, and not sinking', 3, (save) => (liftsIn(save)[0].sunk = -1)],
    ['a guard sinking round a tower that is still coming up', 1, (save) => (liftsIn(save)[0].sunk = 0.1)],
    ['a guard that is neither up nor sinking', 1, (save) => (liftsIn(save)[0].sunk = -0.5)],
    ['a guard rising and sinking at once', 0, (save) => (liftsIn(save)[0].sunk = 0.1)],
    ['a guard that has sunk for as long as it takes and is still there', 3, (save) => (liftsIn(save)[0].sunk = LIFT.closes)],
    ['a hatch that takes longer to open than it does', 0, (save) => (liftsIn(save)[0].wait = LIFT.opens + 0.01)],
    ['a lift in front of the pusher’s lip', 1, (save) => (liftsIn(save)[0].behind = -1)],
    ['more lifts than there could be', 4, (save) => (save.machine.lifts = Array.from({ length: LIMITS.lifts + 1 }, (_, i) => ({ id: 900000 + i, x: 50, behind: 9, size: 5, wait: 0, sunk: 0.1 })))],
    ['a poured medal that is a ball', 1, (save) => Object.assign(find(save.machine.falling, (medal) => medal.source === 'pour'), { ball: true })],
    ['a poured medal on its way to the lower table', 1, (save) => (find(save.machine.falling, (medal) => medal.source === 'pour').level = 0)],
  ];

  it.each(forged)('refuses %s', (_name, moment, forge) => {
    const save = at(moment);
    expect(restore(JSON.stringify(save), 1)).not.toBeNull();
    forge(save);
    expect(restore(JSON.stringify(save), 1)).toBeNull();
  });

  it('would have had a tower lying on other medals carried off its lift by the next step, which is why it is refused', () => {
    const session = caught(MOMENTS[1][1]);
    const [lift] = session.machine.lifts;
    const tower = session.machine.medals.find((medal) => medal.id === lift.id) as Medal;
    // As the machine makes it, the tower is on the deck, and it is still on its lift a step later.
    expect(tower.tier).toBe(0);
    const offLift = (): number => Math.hypot(tower.x - lift.x, tower.y - (pusherFront(session.machine.time) - lift.behind));
    advance(session, DT);
    expect(offLift()).toBeLessThan(LIMITS.held);
    expect(restore(serialize(session), 1)).not.toBeNull();
    // Forged onto the pile, with a medal under it that another is pushing aside, it is carried along with that medal after its lift has placed it.
    tower.tier = 1;
    const lying = (x: number): Medal => ({ id: session.machine.nextId++, x, y: tower.y, level: 1, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1 });
    session.machine.medals.push(lying(tower.x + 1), lying(tower.x + 1 + MEDAL_RADIUS * 1.8));
    expect(restore(serialize(session), 1)).toBeNull();
    let furthest = 0;
    for (let i = 0; i < 30; i++) {
      advance(session, DT);
      furthest = Math.max(furthest, offLift());
    }
    expect(furthest).toBeGreaterThan(LIMITS.held);
  });

  it('takes a tower held against the back wall where the wall has come as far forward as its hatch, and goes on taking it', () => {
    // Only a tower that was going up near the wall in a game before the lifts can be found there: today's hatches are all clear of it.
    const session = caught(MOMENTS[1][1]);
    const [lift] = session.machine.lifts;
    const tower = session.machine.medals.find((medal) => medal.id === lift.id) as Medal;
    lift.behind = pusherFront(session.machine.time) - 1;
    tower.y = MEDAL_RADIUS;
    let back = restore(serialize(session), 1);
    expect(back).not.toBeNull();
    for (let i = 0; i < 90 && back; i++) {
      advance(back, DT);
      const held = back.machine.lifts.find((one) => one.id === lift.id && holds(one));
      const at = back.machine.medals.find((medal) => medal.id === lift.id);
      if (held && at) expect(at.y).toBeCloseTo(Math.max(MEDAL_RADIUS, pusherFront(back.machine.time) - held.behind), 6);
      back = restore(serialize(back), 1);
    }
    expect(back).not.toBeNull();
  });

  it('takes a guard that is sinking with its tower already pushed away and gone over', () => {
    const save = at(3);
    const [lift] = liftsIn(save);
    save.machine.medals = save.machine.medals.filter((medal) => medal.id !== lift.id);
    const back = restore(JSON.stringify(save), 1);
    expect(back).not.toBeNull();
    for (let i = 0; i < 60; i++) advance(back as Session, DT);
    expect((back as Session).machine.lifts).toEqual([]);
  });

  it('opens the doors of an older save as soon as it starts, when it was saved with a prize big enough to pour still waiting', () => {
    const session = createSession(9, { balls: 0 });
    queuePayout(session.machine, 64);
    // As the version before the payout works wrote it: no doors, no lifts, and neither of the lucky lamp's two numbers.
    const save = withoutLamp(JSON.parse(serialize(session)) as Save);
    delete save.machine.hopper;
    delete save.machine.lifts;
    save.version = VERSION_BEFORE_WORKS;
    const back = restore(JSON.stringify(save), 1) as Session;
    expect(back).not.toBeNull();
    expect(back.machine.hopper).toEqual(shutHopper());
    // That version had jewels: the two a new machine has are still on its lower table.
    expect(jewelsOnField(back.machine)).toBe(START_JEWELS);
    const events: SessionEvent[] = [];
    advance(back, DT, events);
    expect(events).toContainEqual({ type: 'pourStart', medals: 64 });
  });
});
