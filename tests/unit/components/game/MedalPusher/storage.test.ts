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
  MEDAL_RADIUS,
  PUSHER,
  ROLL_TIME,
  SETTLE,
  TOWER,
  armGoal,
  armStart,
  ballsOnField,
  buildTowers,
  medalsOnField,
  pusherFront,
  queuePayout,
  seededRng,
  tipOf,
} from '@/components/game/MedalPusher/engine';
import { chuckerSpots } from '@/components/game/MedalPusher/chuckers';
import { BOARD, BOWL, CHAIN_GOAL, CHESTS, JACKPOT_START, JACKPOT_STEP, REACH_KINDS, ROULETTE, squareAfter } from '@/components/game/MedalPusher/lottery';
import {
  MAX_STOCK,
  START_CREDITS,
  TIMING,
  advance,
  createSession,
  insert,
  pickChest,
  refill,
  sugorokuDuration,
  type Session,
  type SessionEvent,
} from '@/components/game/MedalPusher/session';
import { LIMITS, STORAGE_KEY, STORAGE_VERSION, VERSION_BEFORE_ARMS, VERSION_WITH_ONE_AIM, restore, serialize } from '@/components/game/MedalPusher/storage';

import beforeArms from './fixtures/save-before-feed-arms.json';
import beforeSlots from './fixtures/save-before-the-front-slots.json';
import beforeLeftAndRight from './fixtures/save-before-left-and-right.json';
import beforeLipChuckers from './fixtures/save-before-lip-chuckers.json';

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

/** The roll that stops the roulette on a given pocket, and the one that drops the ball into a given hole of the bowl. */
const pocketRoll = (pocket: number): number => (pocket + 0.5) / ROULETTE.length;
const holeRoll = (hole: number): number => (hole + 0.5) / BOWL.length;
/** The pockets of a full run: as many numbers as it takes to send the ball into the bowl. */
const FULL_RUN = [1, 2, 3, 5, 6, 7].slice(0, CHAIN_GOAL);

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
      if (roulette?.bowl) seen.add(roulette.bowl.payout < 0 ? 'ball rolling' : roulette.jackpot ? 'jackpot' : 'ball in a hole');
      else if (roulette) seen.add(roulette.over ? 'roulette over' : roulette.landed ? 'roulette landed' : 'roulette');
      const back = reread(session);
      expect(serialize(back)).toBe(serialize(session));
      expect(back.spin).toEqual(session.spin);
      expect(back.bonus).toEqual(session.bonus);
      expect(back.roulette).toEqual(session.roulette);
    }
  }

  it('comes back at every moment of a spin, a bonus game, a roulette and the bowl', { timeout: LONG }, () => {
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

    // A full run, and the ball into the jackpot's hole.
    session = quiet();
    session.balls = 1;
    script(session, [...FULL_RUN.map(pocketRoll), holeRoll(0)]);
    follow(session, 27, seen);
    expect(session.jackpots).toBe(1);

    // The same run, and the ball into a hole that holds medals.
    session = quiet();
    session.balls = 1;
    script(session, [...FULL_RUN.map(pocketRoll), holeRoll(1)]);
    follow(session, 27, seen);
    expect(session.jackpots).toBe(0);
    expect(session.paidOut).toBe(FULL_RUN.reduce((sum, pocket) => sum + (ROULETTE[pocket] as number), 0) + (BOWL[1] as number));

    const everything = ['spin', 'long reach', 'spin done', 'sugoroku', 'sugoroku paid', 'chest', 'chest picked', 'chest paid'];
    expect([...seen].sort()).toEqual([...everything, 'roulette', 'roulette landed', 'roulette over', 'ball rolling', 'jackpot', 'ball in a hole'].sort());
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
  return { ...tables, waits: [cooldown, cooldown], aims: [tipOf(0, aim as number), tipOf(1, aim as number)], tips, nextId };
};
/** A whole version-2 save as today's game writes the same machine. */
const writtenToday = (text: string): string => {
  const save = JSON.parse(text) as Save;
  return JSON.stringify({ ...save, version: STORAGE_VERSION, machine: asToday(save.machine) });
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
const ball = (save: Save): Row => find(save.machine.medals, (medal) => medal.ball === true);
const loose = (save: Save): Row => find(save.machine.medals, (medal) => medal.ball === false && medal.stack === 1 && medal.grow === 0);
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
    ['a tower that will be as tall as the tallest', (save) => (tower(save).stack = TOWER.max - (tower(save).grow as number))],
    ['a medal that has only just landed', (save) => (loose(save).grown = SETTLE.from)],
    ['a medal that dropped this instant', (save) => (loose(save).sinceDrop = 0)],
    ['a slot that has only just fed a medal', (save) => (save.machine.waits = [0, DROP_INTERVAL])],
    ['both slots at the start of a wait', (save) => (save.machine.waits = [DROP_INTERVAL, DROP_INTERVAL])],
    ['a medal about to land', (save) => (inAir(save).remaining = 0)],
    ['a clock that has run for years', (save) => (save.machine.time = LIMITS.clock / 2)],
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
    const { rng: _rng, rolling, aims, waits, tips, ...field } = back.machine;
    const { cooldown, ...tables } = save.machine;
    expect(JSON.stringify(field)).toBe(JSON.stringify(tables));
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
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(save.session));
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
    // It was holding seven when it was saved, more than the screen could play in the time: as many spins as then.
    expect(at.stock).toBe(7);
    expect(back.spins).toBe(then.spins);
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
    expect(Object.keys(save.session).sort()).toEqual(Object.keys(JSON.parse(serialize(createSession(1))).session).sort());
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
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(save.session));
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
    expect(JSON.stringify(numbers)).toBe(JSON.stringify(save.session));
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
    expect(events.flatMap((event) => (event.type === 'checker' ? [event.gate] : []))).toEqual(then.gates);
    expect([back.credits, back.hits, back.stock, back.spins, back.wasted, back.paidOut]).toEqual([then.credits, then.hits, then.stock, then.spins, then.wasted, then.paidOut]);
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
  // A full run of 10, 20, 30 and 10, and the ball two seconds into the bowl.
  const ROLLING = { hole: 1, elapsed: 2, duration: TIMING.bowl, payout: -1 };
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
    ['a hole the bowl does not have', { ...BOWLED, bowl: { ...ROLLING, hole: BOWL.length } }],
    ['a hole before the first', { ...BOWLED, bowl: { ...ROLLING, hole: -1 } }],
    ['a ball that rolls for no time', { ...BOWLED, bowl: { ...ROLLING, duration: 0 } }],
    ['a ball let go before it was let go', { ...BOWLED, bowl: { ...ROLLING, elapsed: -1 } }],
    ['a hole that paid less than nothing', { ...BOWLED, bowl: { ...ROLLING, payout: -2 } }],
    ['a bowl with a field missing', { ...BOWLED, bowl: { hole: 1, elapsed: 2, duration: TIMING.bowl } }],
    ['a bowl with a field too many', { ...BOWLED, bowl: { ...ROLLING, spin: 3 } }],
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

  // A full run, and the ball into the jackpot's hole.
  session = quiet();
  session.balls = 1;
  script(session, [...FULL_RUN.map(pocketRoll), holeRoll(0)]);
  until(session, 'the last number', () => session.roulette?.level === CHAIN_GOAL && session.roulette.bowl === null);
  until(session, 'the ball rolling', () => (session.roulette?.bowl?.elapsed ?? 0) > 0.5);
  until(session, 'the ball in the jackpot', () => (session.roulette?.bowl?.payout ?? -1) >= 0);

  // The same run, and the ball into a hole that holds medals.
  session = quiet();
  session.balls = 1;
  script(session, [...FULL_RUN.map(pocketRoll), holeRoll(1)]);
  until(session, 'the ball in a hole', () => (session.roulette?.bowl?.payout ?? -1) >= 0);
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
    expect(Object.keys(PHASES)).toHaveLength(25);
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
    expect(at('the ball rolling').screen.roulette).toMatchObject({ bowl: { hole: 0, duration: TIMING.bowl, payout: -1 } });
    expect(at('the ball in the jackpot').screen.roulette).toMatchObject({ over: true, jackpot: true, gain: JACKPOT_START, total: RUN_PAID + JACKPOT_START });
    expect(at('the ball in the jackpot').screen.roulette).toMatchObject({ bowl: { hole: 0, payout: JACKPOT_START } });
    expect(at('the ball in the jackpot').session.jackpots).toBe(1);
    expect(at('the ball in a hole').screen.roulette).toMatchObject({ over: true, jackpot: false, gain: BOWL[1], total: RUN_PAID + (BOWL[1] as number) });
    expect(at('the ball in a hole').screen.roulette).toMatchObject({ bowl: { hole: 1, payout: BOWL[1] } });
  });

  // One field of a good save changed, into something the machine never passes through.
  const other = (chest: Row): number => ((chest.picked as number) + 1) % CHESTS.length;
  const result = (spin: Row): Row => spin.result as Row;
  const bowl = (run: Row): Row => run.bowl as Row;
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
    ['the first turn', 'has a ball in the bowl already', (run) => (run.bowl = { hole: 0, elapsed: 0, duration: TIMING.bowl, payout: -1 })],
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
    ['a number', 'has a ball in the bowl with the run not full', (run) => (run.bowl = { hole: 0, elapsed: 0, duration: TIMING.bowl, payout: -1 })],
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

    // The end of a full run: the last number, and the ball in the bowl
    ['the last number', 'has not landed', (run) => (run.landed = false)],
    ['the last number', 'has ended the run', (run) => (run.over = true)],
    ['the last number', 'is a jackpot', (run) => (run.jackpot = true)],
    ['the last number', 'has kept the ball out of the bowl past its time', (run) => (run.elapsed = (run.duration as number) + TIMING.step)],
    ['the last number', 'has the ball in the bowl before its time', (run) => (run.bowl = { hole: 0, elapsed: 0, duration: TIMING.bowl, payout: -1 })],
    ['the last number', 'has a total its numbers do not make', (run) => (run.total = (run.total as number) + 5)],
    ['the ball rolling', 'has dropped while it is rolling', (run) => (bowl(run).payout = 50)],
    ['the ball rolling', 'is still rolling at the moment it drops', (run) => (bowl(run).elapsed = bowl(run).duration)],
    ['the ball rolling', 'rolls for a time the machine gives no ball', (run) => (bowl(run).duration = 5)],
    ['the ball rolling', 'is in a bowl whose run has ended', (run) => (run.over = true)],
    ['the ball rolling', 'is a jackpot before it has dropped', (run) => (run.jackpot = true)],
    ['the ball rolling', 'still shows the last number as its gain', (run) => (run.gain = ROULETTE[run.pocket as number])],
    ['the ball rolling', 'is in a bowl whose last number never landed', (run) => (run.landed = false)],
    ['the ball rolling', 'is in a bowl after a run one number short', (run) => (run.level = CHAIN_GOAL - 1)],
    ['the ball rolling', 'was let go before the last number had its time', (run) => (run.elapsed = run.duration)],
    ['the ball rolling', 'is in a bowl after a cross', (run) => (run.pocket = 0)],
    ['the ball rolling', 'has a total its numbers do not make', (run) => (run.total = (run.total as number) + 5)],
    ['the ball rolling', 'is in a bowl with no ball in it', (run) => (run.bowl = null)],
    ['the ball in the jackpot', 'has not dropped after all', (run) => (bowl(run).payout = -1)],
    ['the ball in the jackpot', 'is no jackpot', (run) => (run.jackpot = false)],
    ['the ball in the jackpot', 'has not ended the run', (run) => (run.over = false)],
    ['the ball in the jackpot', 'has no gain', (run) => (run.gain = 0)],
    ['the ball in the jackpot', 'paid less than its gain says', (run) => (bowl(run).payout = JACKPOT_START - 1)],
    ['the ball in the jackpot', 'is in another hole', (run) => (bowl(run).hole = 1)],
    ['the ball in the jackpot', 'dropped before its time', (run) => (bowl(run).elapsed = 0.5)],
    ['the ball in the jackpot', 'is shown past its time', (run) => (bowl(run).elapsed = (bowl(run).duration as number) + TIMING.prize)],
    ['the ball in the jackpot', 'has a total without the jackpot in it', (run) => (run.total = (run.total as number) - (run.gain as number))],
    ['the ball in the jackpot', 'won with no bowl at all', (run) => (run.bowl = null)],
    ['the ball in a hole', 'has not dropped after all', (run) => (bowl(run).payout = -1)],
    ['the ball in a hole', 'is a jackpot', (run) => (run.jackpot = true)],
    ['the ball in a hole', 'paid what another hole holds', (run) => (bowl(run).payout = BOWL[2])],
    ['the ball in a hole', 'is in the hole of the jackpot', (run) => (bowl(run).hole = 0)],
    ['the ball in a hole', 'has a total without the hole in it', (run) => (run.total = RUN_PAID)],
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
        bowl(run).payout = (BOWL[1] as number) + 10;
        run.gain = (BOWL[1] as number) + 10;
        run.total = (run.total as number) + 10;
      },
    ],
    [
      'the ball in a hole',
      'is in the hole of the jackpot with a jackpot to match, and is not called one',
      (run) => {
        bowl(run).hole = 0;
        bowl(run).payout = JACKPOT_START;
        run.gain = JACKPOT_START;
        run.total = RUN_PAID + JACKPOT_START;
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
    ['the ball in a hole', 'pay the hole again', undrop, paid],
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
    for (let i = 0; i < 9; i++) advance(back, DT);
    expect(back.paidOut).toBe(before.paidOut);
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

  it('reads back a full run at the instant the ball is let go, and at the instant it drops', () => {
    const session = quiet();
    session.balls = 1;
    script(session, [...FULL_RUN.map(pocketRoll), holeRoll(0)]);
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
    expect(session.roulette?.bowl).toEqual({ hole: 0, elapsed: 0, duration: TIMING.bowl, payout: -1 });
    advance(session, TIMING.bowl);
    expect(session.roulette?.bowl).toEqual({ hole: 0, elapsed: TIMING.bowl, duration: TIMING.bowl, payout: JACKPOT_START });
    expect(session.roulette).toMatchObject({ over: true, jackpot: true, gain: JACKPOT_START });
    expect(serialize(reread(session))).toBe(serialize(session));
    advance(session, TIMING.prize);
    expect(session.roulette).toBeNull();
    expect(session.jackpots).toBe(1);
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
      if (roulette?.bowl) at.push(roulette.bowl.duration - roulette.bowl.elapsed, roulette.bowl.duration + TIMING.prize - roulette.bowl.elapsed);
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
        if (roulette.bowl.elapsed === roulette.bowl.duration) note('on a threshold');
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
        if (swept && i % 300 === 0) Object.assign(session.machine, { medals: [], falling: [], payoutQueue: 0, growing: 0 });
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
    const runs = ['turning', 'on a number', 'on a cross', 'on the last number', 'ball rolling', 'ball in the jackpot', 'ball in a hole'];
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
    // And each of the medals that was on its way then lies where that game's machine left it.
    expect(then.resting).toHaveLength(5);
    for (const rest of then.resting) {
      const medal = back.machine.medals.find((m) => m.id === rest.id);
      expect(medal).toMatchObject({ level: rest.level, tier: rest.tier });
      expect(medal?.x).toBeCloseTo(rest.x, 6);
      expect(medal?.y).toBeCloseTo(rest.y, 6);
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
